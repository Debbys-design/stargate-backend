# Invoice Payment Flow

Full lifecycle of a Stargate invoice from creation to settlement, with Mermaid sequence diagrams.

---

## 1. Invoice Creation

```mermaid
sequenceDiagram
    actor Merchant
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Stellar as StellarService

    Merchant->>API: POST /invoices { amount_usdc, expires_in_minutes }
    API->>API: Validate input (Zod schema)
    API->>DB: SELECT merchant tier & fee config
    DB-->>API: merchant row
    API->>API: Calculate fee (bps + fixed)
    API->>DB: SELECT / UPDATE muxed_base_id
    DB-->>API: muxed_base_id
    API->>DB: COUNT invoices for next sequence
    DB-->>API: next sequence number
    API->>Stellar: buildMuxedAddress(muxed_id)
    Stellar-->>API: M... muxed address
    API->>DB: INSERT invoices row
    DB-->>API: invoice row
    API-->>Merchant: 201 { id, payment_url, gross_usdc, muxed_address, expires_at }
```

---

## 2. Payer Fetches Details and Submits Transaction

```mermaid
sequenceDiagram
    actor Payer
    participant PayPage as Pay Page (Frontend)
    participant API as NestJS API
    participant Horizon as Stellar Horizon

    Payer->>PayPage: Open payment_url
    PayPage->>API: GET /invoices/public/:id
    API-->>PayPage: { gross_usdc, muxed_address, expires_at, merchant_name }

    PayPage->>API: GET /payments/:id/prepare-tx?payer=<key>
    API->>Horizon: loadAccount(payer_public_key)
    Horizon-->>API: account (sequence number)
    API->>API: Build payment XDR (USDC → muxed_address)
    API-->>PayPage: { xdr, network }

    Payer->>PayPage: Sign XDR with wallet
    PayPage->>Horizon: Submit signed transaction
    Horizon-->>PayPage: { hash, ledger }
    PayPage-->>Payer: "Payment submitted"
```

---

## 3. Reconciler Detects and Processes the Payment

```mermaid
sequenceDiagram
    participant Horizon as Stellar Horizon (SSE)
    participant Reconciler as Rust Reconciler
    participant Redis as Redis
    participant DB as PostgreSQL

    loop Streaming payments via SSE
        Horizon-->>Reconciler: data: { paging_token, from, to, amount, asset_code, memo }
    end

    Reconciler->>DB: SELECT 1 FROM payment_events WHERE paging_token=? (dedup check)
    DB-->>Reconciler: null (new event)
    Reconciler->>Reconciler: Filter: asset_code == USDC && asset_issuer matches
    Reconciler->>Redis: OFAC screen sender address
    Redis-->>Reconciler: { result: "clear" }
    Reconciler->>DB: SELECT invoice WHERE muxed_id=? AND status='pending'
    DB-->>Reconciler: invoice row
    Reconciler->>Reconciler: Verify paid amount == gross_usdc

    Reconciler->>DB: BEGIN TRANSACTION
    Reconciler->>DB: INSERT payment_events
    Reconciler->>DB: INSERT ledger_entries (gross, fee, net)
    Reconciler->>DB: UPDATE invoices SET status='paid', paid_at=NOW()
    Reconciler->>DB: INSERT webhook_deliveries for active webhooks
    Reconciler->>DB: COMMIT

    Reconciler->>Redis: PUBLISH invoice:<id> { status: "paid", tx_hash }
    Reconciler->>DB: UPDATE reconciler_state SET cursor=paging_token
```

---

## 4. Real-Time Status Stream (SSE)

```mermaid
sequenceDiagram
    participant PayPage as Pay Page (Frontend)
    participant API as NestJS API (SSE)
    participant Redis as Redis

    PayPage->>API: GET /payments/:id/stream (SSE)
    API->>Redis: SUBSCRIBE invoice:<id>

    loop Every 15 seconds
        API-->>PayPage: { type: "heartbeat" }
    end

    Redis-->>API: message { status: "paid", tx_hash }
    API-->>PayPage: { status: "paid", tx_hash }
    PayPage-->>PayPage: Show success screen
    API->>API: complete() — close SSE stream
```

---

## 5. Webhook Delivery

```mermaid
sequenceDiagram
    participant Worker as Webhook Worker (NestJS Cron)
    participant DB as PostgreSQL
    participant Merchant as Merchant Endpoint

    loop Every 30 seconds
        Worker->>DB: SELECT pending deliveries WHERE next_retry_at <= NOW() LIMIT 50
        DB-->>Worker: delivery rows
    end

    Worker->>Worker: Sign payload: sha256=HMAC-SHA256(secret, JSON.stringify(payload))
    Worker->>Merchant: POST <url> { X-Stargate-Signature, X-Stargate-Event, body }
    Merchant-->>Worker: 200 OK
    Worker->>DB: UPDATE delivery SET status='delivered', delivered_at=NOW()
```

---

## 6. Webhook Retry on Failure

```mermaid
sequenceDiagram
    participant Worker as Webhook Worker
    participant Merchant as Merchant Endpoint
    participant DB as PostgreSQL

    Worker->>Merchant: POST <url> (attempt 1)
    Merchant-->>Worker: 500 / timeout

    Worker->>DB: SET attempts=1, next_retry_at=NOW()+1min, status='pending'

    Note over Worker,DB: Back-off schedule: 0s → 1m → 5m → 30m → 2h (max 5 attempts)

    Worker->>Merchant: POST <url> (attempt 2)
    Merchant-->>Worker: 200 OK
    Worker->>DB: SET status='delivered'
```

---

## 7. Invoice Expiry

```mermaid
sequenceDiagram
    participant Cron as NestJS Cron (every 5 min)
    participant DB as PostgreSQL

    Cron->>DB: UPDATE invoices SET status='expired'<br/>WHERE status='pending' AND expires_at < NOW()
    DB-->>Cron: N rows updated
```

---

## 8. Invoice State Machine

```mermaid
stateDiagram-v2
    [*] --> pending : POST /invoices

    pending --> paid      : Reconciler confirms on-chain payment
    pending --> expired   : expires_at passes (cron job)
    pending --> cancelled : Merchant calls POST /invoices/:id/cancel

    paid      --> [*]
    expired   --> [*]
    cancelled --> [*]
```

---

## Summary Table

| Step | Component  | Action                                                   |
| ---- | ---------- | -------------------------------------------------------- |
| 1    | API        | Creates invoice with muxed address and fee calculation   |
| 2    | Frontend   | Fetches invoice details, builds unsigned XDR             |
| 3    | Payer      | Signs and submits transaction to Stellar                 |
| 4    | Reconciler | Streams Horizon SSE, matches payment to invoice          |
| 5    | Reconciler | Writes ledger entry, marks invoice paid, queues webhook  |
| 6    | Worker     | Delivers webhook with HMAC signature, retries on failure |
| 7    | Cron       | Expires unpaid invoices every 5 minutes                  |
