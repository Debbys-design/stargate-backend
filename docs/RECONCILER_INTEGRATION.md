# Reconciler and Backend Integration Flow

This document explains how the Rust reconciler, payment events, ledger entries, and NestJS backend services work together locally.

## Architecture Overview

The system consists of three main components:

1. **NestJS Backend API** - Handles invoice creation, merchant management, and SSE streaming
2. **Rust Reconciler** - Monitors Stellar blockchain for payments and reconciles them with invoices
3. **PostgreSQL Database** - Shared state between backend and reconciler
4. **Redis** - Event delivery and SSE fanout

## Data Flow

### 1. Invoice Creation

```
Merchant API Request
    ↓
InvoicesService.create()
    ↓
Generate muxed_id (merchant_base + sequence)
    ↓
INSERT INTO invoices (merchant_id, muxed_id, muxed_address, status='pending')
    ↓
Return invoice with payment_url
```

**Key Tables:**
- `invoices` - Stores invoice metadata, status, and muxed account details
- `merchants` - Stores merchant info including muxed_base_id

### 2. Payment Monitoring (Reconciler)

The reconciler runs continuously and:

```
Reconciler Start
    ↓
Load cursor from reconciler_state (or RECONCILER_CURSOR env)
    ↓
Connect to Stellar Horizon API
    ↓
Stream payments from cursor onwards
    ↓
For each payment:
  - Extract muxed_id from destination account
  - Check if muxed_id exists in invoices table
  - Validate amount matches invoice.gross_usdc
  - Run OFAC screening if enabled
    ↓
INSERT INTO payment_events (invoice_id, muxed_id, stellar_tx_hash, ledger_sequence, ofac_result)
    ↓
UPDATE invoices SET status='paid', paid_at=NOW() WHERE id=invoice_id
    ↓
INSERT INTO ledger_entries (invoice_id, merchant_id, event_id, type='payment', gross_usdc, fee_usdc, net_usdc)
    ↓
PUBLISH to Redis: invoice:{invoice_id} → {status: 'paid', ...}
    ↓
Update cursor in reconciler_state
```

**Key Tables:**
- `payment_events` - Raw payment data from Stellar with matching status
- `ledger_entries` - Accounting records for settlements and reporting
- `reconciler_state` - Tracks cursor position for resumable streaming

### 3. Real-time Updates (SSE)

When a payment is detected:

```
Reconciler publishes to Redis
    ↓
PUBLISH invoice:{invoice_id} → JSON payload
    ↓
RedisSubscriptionService receives message
    ↓
Broadcasts to all SSE subscribers watching that invoice
    ↓
Client receives update via EventSource
    ↓
If status='paid' or 'expired', close SSE connection
```

**Key Components:**
- `RedisSubscriptionService` - Manages shared Redis subscription connections
- `PaymentsService.stream()` - Returns Observable SSE stream
- `payments.controller.ts` - Exposes `GET /payments/:id/stream` endpoint

### 4. Webhook Delivery

After payment is recorded:

```
Payment event created
    ↓
WebhookDeliveryWorker picks up job
    ↓
Fetch merchant webhooks from database
    ↓
POST to webhook URL with payment_events data
    ↓
Retry with exponential backoff on failure
    ↓
Store delivery status in webhooks table
```

## Local Development Setup

### Prerequisites

```bash
# Start services
docker compose up -d postgres redis

# Copy environment
cp .env.example .env

# Install dependencies
npm install

# Run migrations
npm run db:migrate
```

### Running Components Locally

**Terminal 1 - Backend API:**
```bash
npm run start:dev
# Listens on http://localhost:3000
```

**Terminal 2 - Reconciler:**
```bash
cd reconciler
cargo run
# Connects to Postgres and Redis from .env
# Streams from Stellar Horizon
```

**Terminal 3 - Test Invoice Creation:**
```bash
# Register merchant
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Create invoice (use token from login)
curl -X POST http://localhost:3000/invoices \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount_usdc":"100.00","expires_in_minutes":60}'
```

## Key Integration Points

### 1. Muxed ID Allocation

- **Backend**: Generates unique muxed_id = merchant.muxed_base_id + invoice_sequence
- **Reconciler**: Extracts muxed_id from payment destination account
- **Matching**: Looks up invoice by muxed_id to link payment to invoice

```sql
-- Backend generates
muxed_id = (merchant_index * 16_777_216) + invoice_count

-- Reconciler extracts from Stellar payment
destination_account = "GXXXXXX" (base account)
muxed_id = 12345 (from payment envelope)
```

### 2. Status Transitions

```
Invoice Status Flow:
pending → paid (when payment received)
pending → expired (when expires_at < NOW())
pending → cancelled (merchant cancels)

Payment Event Status:
created → matched (when linked to invoice)
matched → ofac_screened (if screening enabled)
```

### 3. Ledger Entries

Accounting records created for:
- **payment**: When payment received (gross_usdc, fee_usdc, net_usdc)
- **refund**: When payment refunded
- **fee**: When fee collected
- **settlement**: When funds settled to merchant

## Monitoring and Debugging

### Check Reconciler Status

```bash
# Redis
redis-cli GET reconciler:status
redis-cli GET reconciler:cursor

# Database
SELECT * FROM reconciler_state;
SELECT * FROM payment_events ORDER BY created_at DESC LIMIT 10;
```

### Verify Invoice-Payment Linking

```sql
-- Find invoice with its payment events
SELECT i.id, i.muxed_id, i.status, pe.stellar_tx_hash, pe.matched_at
FROM invoices i
LEFT JOIN payment_events pe ON pe.invoice_id = i.id
WHERE i.id = '<invoice-id>';
```

### Test SSE Connection

```bash
# Create invoice and get ID
INVOICE_ID="<from-create-response>"

# Open SSE stream
curl -N http://localhost:3000/payments/$INVOICE_ID/stream

# In another terminal, simulate payment (requires Stellar testnet setup)
# Reconciler will detect and publish update
```

## Performance Considerations

### Database Indexes

- `invoices(merchant_id, status, created_at DESC)` - Invoice listing
- `invoices(muxed_id)` - Payment matching
- `payment_events(invoice_id)` - Event lookup
- `payment_events(paging_token)` - Cursor tracking

### Redis Optimization

- Single subscription connection per channel (not per client)
- Heartbeat every 15 seconds to keep SSE alive
- Automatic cleanup when all subscribers disconnect

### Reconciler Performance

- Streams from Horizon (not polling)
- Batch inserts for payment events
- Cursor-based resumable processing
- OFAC screening is optional and can be disabled

## Troubleshooting

### Reconciler Not Detecting Payments

1. Check reconciler is running: `redis-cli GET reconciler:status`
2. Verify cursor position: `SELECT * FROM reconciler_state`
3. Check Horizon connectivity: `curl https://horizon-testnet.stellar.org/`
4. Verify muxed_id matches: `SELECT muxed_id FROM invoices WHERE id='<id>'`

### SSE Not Receiving Updates

1. Check Redis connection: `redis-cli PING`
2. Verify subscription: `redis-cli PUBSUB CHANNELS`
3. Check payment_events table for new records
4. Verify invoice status updated to 'paid'

### Database Migration Issues

1. Check migration status: `SELECT * FROM schema_migrations`
2. Verify all migrations ran: `npm run db:migrate`
3. Check for pending migrations: `npm run db:migrate:status`

## Related Documentation

- [LAUNCH_RUNBOOK.md](./LAUNCH_RUNBOOK.md) - Production deployment
- [RECOVERY.md](./RECOVERY.md) - Disaster recovery procedures
- [openapi.yaml](./openapi.yaml) - API specification
