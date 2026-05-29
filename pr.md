# feat: KYC webhooks, reconciler status, treasury signing, merchant test-mode

## Summary

Four independent backend enhancements delivered in a single branch, each committed separately.

---

## Changes

### 1 — Emit `merchant.kyc.approved` and `merchant.kyc.rejected` webhook events

**Motivation:** Platforms integrating with Stargate need a push notification when a merchant's KYC review concludes so they can unlock features or notify the merchant without polling.

**What changed:**
- `db/migrations/009_merchant_kyc_testmode.sql` — adds `kyc_status TEXT` (`pending` | `approved` | `rejected`) and `test_mode BOOLEAN` columns to `merchants`.
- `WebhooksService.emitKycEvent` — inserts `webhook_deliveries` rows scoped to webhooks that have subscribed to the relevant event type.
- `MerchantsService.updateKycStatus` — sets `kyc_status` and clears/sets `kyb_verified_at` atomically.
- `AdminController` (`POST /admin/merchants/:id/kyc/approve` and `/reject`) — JWT-guarded admin endpoints that update status and fire the webhook.
- Webhook creation schema and `CreateWebhookDto` extended with the two new event types.
- `test/kyc-webhooks.spec.ts` — 3 unit tests.

---

### 2 — HTTP status endpoint on the Rust reconciler sidecar

**Motivation:** Kubernetes liveness/readiness probes and ops dashboards need a lightweight HTTP endpoint to check whether the reconciler is running without connecting to Redis or Postgres directly.

**What changed:**
- `reconciler/src/status.rs` — minimal raw-TCP HTTP server. `GET /status` reads the `reconciler:status` key from Redis and returns `{"status": "running"}` (or the current value). All other paths return 404.
- `reconciler/src/main.rs` — spawns the status server as a background `tokio::spawn` task on `RECONCILER_STATUS_PORT` (default `9090`) before entering the stream loop.
- `.env.example` — documents `RECONCILER_STATUS_PORT=9090`.
- Inline `#[test]` verifying the JSON response shape.

---

### 3 — Treasury approval signatures via REST

**Motivation:** Authorised signers (ops tooling, multisig coordinators) need to submit a 32-byte transaction digest and receive a KMS-backed ECDSA signature without direct AWS SDK access.

**What changed:**
- `src/treasury/treasury.controller.ts` — `POST /treasury/sign` (JWT-guarded). Validates the body contains a 32-byte hex digest, delegates to `KmsSignerService.signDigest`, and returns the signature as a hex string.
- `src/treasury/treasury.module.ts` — imports `StellarModule` to consume the already-exported `KmsSignerService`.
- `TreasuryModule` registered in `AppModule`.
- `test/treasury.spec.ts` — 3 unit tests covering missing digest, wrong-length digest, and the happy path.

---

### 4 — Test-mode flag per merchant

**Motivation:** Merchants onboarding or integrating should be able to run end-to-end flows against Stellar testnet contracts without affecting mainnet state, controlled per-merchant rather than globally.

**What changed:**
- `PATCH /merchants/me` now accepts `test_mode: boolean` (added to `updateMerchantSchema` and `UpdateMerchantDto`).
- `StellarService.buildPaymentXdr` accepts an optional `testMode` parameter — when `true` it forces `Networks.TESTNET` passphrase regardless of the `STELLAR_NETWORK` env var; when `false` it forces `Networks.PUBLIC`.
- `InvoicesService.getPublic` includes `m.test_mode` in the JOIN query so the value is available at payment-preparation time.
- `PaymentsService.prepareTx` passes `invoice.test_mode` to `buildPaymentXdr` and reflects it in the `network` field of the response so the frontend knows which network to submit the XDR to.
- `test/test-mode.spec.ts` — 3 unit tests.

---

## Verification

```sh
npm run typecheck   # passes
npm test            # 10/10 tests pass (4 suites)
cargo test --manifest-path reconciler/Cargo.toml
```

## Migration

```sh
npm run db:migrate
```

Migration `009_merchant_kyc_testmode.sql` is additive (two nullable/defaulted columns) and safe to run against an existing database with zero downtime.

## Checklist

- [x] `npm run typecheck` passes
- [x] `npm test` passes
- [x] Migration is backward-compatible
- [x] No secrets or credentials committed
- [x] `.env.example` updated for new env var (`RECONCILER_STATUS_PORT`)
