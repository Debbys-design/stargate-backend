# Stargate Mainnet Launch Runbook

This runbook adapts the PDF launch prompts to the current Stargate stack: Next.js frontend, NestJS API, PostgreSQL, Redis, Rust reconciler, and Stellar/Soroban contracts.

## T-48 Hours

- Complete `scripts/pre-launch-audit.sh` with production-like environment variables.
- Deploy staging with `STELLAR_NETWORK=mainnet` against staging database and staging treasury accounts.
- Process a real low-value Stellar USDC payment end to end on staging.
- Verify webhook delivery to a controlled test endpoint.
- Confirm database backup and restore completed successfully on staging.
- Confirm on-call coverage, alert routing, and rollback owner.
- Confirm the contracts signing ceremony has the required approvers available.

## T-24 Hours

- Freeze production-bound feature merges.
- Run production database migrations from a dedicated migration job, not app startup.
- Verify `RUN_MIGRATIONS_ON_STARTUP=false` in production runtime.
- Verify `GET /health`, `GET /health/deep`, and `GET /health/rpc` return healthy results.
- Enable uptime monitoring for frontend and API health endpoints.
- Confirm production secrets are stored in Vercel, the API host, AWS KMS, and Redis provider as appropriate.

## Launch

- Confirm GitHub `main` is green for frontend, backend, and contracts.
- Trigger the frontend production workflow.
- Trigger the backend production workflow or provider deployment.
- Verify the deployed API is using mainnet Horizon and Soroban RPC.
- Complete the Soroban mainnet contract signing ceremony only after multi-sig approval.
- Update production contract IDs after verified deployment.
- Run a low-value live transaction smoke test.
- Watch Sentry, logs, Redis queues, and payment success rate for 30 minutes.

## Go/No-Go

- Go if live transaction success rate is at least 98% for the first hour and no critical payment errors are open.
- No-go if success rate drops below 90% for 5 consecutive minutes, RPC health is degraded across all fallbacks, or webhook delivery stalls.

## Rollback

- Roll back the frontend to the previous Vercel deployment.
- Roll back the API to the previous container or platform release.
- Do not automatically roll back data migrations with data changes. Require manual approval.
- Keep sandbox running for at least 30 days after launch.
