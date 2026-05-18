# Stargate Backend

NestJS API, PostgreSQL database, Redis event delivery, webhooks, settlement, compliance, and Rust reconciler sidecar.

## Local Services

```sh
docker compose up -d postgres redis
cp .env.example .env
npm install
npm run db:migrate
npm run start:dev
```

## Verification

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run generate:openapi
cargo test --manifest-path reconciler/Cargo.toml
```

The generated `docs/openapi.yaml` is the source of truth for `stargate-frontend`.

## Production Readiness

Copy `.env.production.example` into your secret manager, never into Git as a real `.env.production`.

The API exposes deployment smoke-test endpoints:

- `GET /health` checks Postgres and Redis.
- `GET /health/deep` adds RPC and queue context for authenticated monitoring.
- `GET /health/rpc` checks Stellar Horizon and Soroban RPC reachability.
