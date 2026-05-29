# TODO

## Goal
Auto-cancel unpaid invoices after a merchant-configured TTL.

## Plan
1. Add merchant configuration field: `unpaid_invoice_ttl_minutes` (default 60) to `merchants` via migration.
2. Implement auto-cancel cron in `InvoicesService`:
   - Add a new `@Cron` job (or update existing one) to set `status='cancelled'` (not `expired`) when:
     - invoice status in (`pending`,`partial`)
     - `created_at + merchant.unpaid_invoice_ttl_minutes` < NOW()
   - Dispatch webhook event `merchant.payment_intent.expired` or `invoice.cancelled` (per current event model).
3. Keep existing `expireInvoices()` behavior consistent with `expires_at` (optional: rename or separate logic).
4. Update types (`packages/types`) if needed for webhook payload/event typings.
5. Add/extend unit test(s) for the new cron logic.
6. Update docs (`docs/INVOICE_PAYMENT_FLOW.md`) if required.
7. Run `npm run typecheck`, `npm test`.

