#!/usr/bin/env bash
set -euo pipefail

secret() {
  openssl rand -base64 32
}

cat <<EOF
# Paste these into your production secret manager. Do not commit real values.
JWT_SECRET=$(secret)$(secret)
WEBHOOK_SIGNING_SECRET=$(secret)
ENCRYPTION_KEY=$(secret)
EOF
