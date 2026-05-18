#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://app.stargate.finance}"
API_URL="${API_URL:-https://api.stargate.finance}"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'OK: %s\n' "$1"
}

require_env() {
  local name="$1"
  local expected="${2:-}"
  local value="${!name:-}"
  [[ -n "$value" ]] || fail "$name is not set"
  if [[ -n "$expected" && "$value" != "$expected" ]]; then
    fail "$name must be $expected"
  fi
  pass "$name is configured"
}

printf 'Running Stargate pre-launch audit for %s and %s\n' "$APP_URL" "$API_URL"

secret_pattern='(sk_live_[A-Za-z0-9_=-]{16,}|pk_live_[A-Za-z0-9_=-]{16,}|whsec_[A-Za-z0-9_=-]{16,}|BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY)'

if git grep -nE "$secret_pattern" -- ':!node_modules' ':!dist' ':!coverage'; then
  fail 'possible production secret found in tracked files'
fi
pass 'tracked file secret scan passed'

if git log --all -p -- . ':!node_modules' ':!dist' ':!coverage' | grep -E "$secret_pattern"; then
  fail 'possible production secret found in git history'
fi
pass 'git history secret scan passed'

npm audit --audit-level=high
pass 'npm high severity audit passed'

require_env NODE_ENV production
require_env STELLAR_NETWORK mainnet
require_env RUN_MIGRATIONS_ON_STARTUP false
require_env DATABASE_URL
require_env DATABASE_DIRECT_URL
require_env REDIS_URL
require_env JWT_SECRET
require_env WEBHOOK_SIGNING_SECRET
require_env ENCRYPTION_KEY
require_env HORIZON_URL
require_env SOROBAN_RPC_URL
require_env STELLAR_ASSET_ISSUER
require_env PLATFORM_TREASURY_PUBLIC_KEY
require_env INVOICE_CONTRACT_ID

curl -fsSI "$APP_URL" | grep -Eiq 'strict-transport-security|x-content-type-options' || fail 'frontend security headers missing'
pass 'frontend security headers present'

curl -fsS "$API_URL/health" >/dev/null || fail 'API /health failed'
pass 'API /health passed'

curl -fsS "$API_URL/health/rpc" >/dev/null || fail 'API /health/rpc failed'
pass 'API /health/rpc passed'

printf 'Stargate pre-launch audit passed.\n'
