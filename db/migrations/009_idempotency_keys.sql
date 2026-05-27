ALTER TABLE invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_merchant_idempotency_key_idx ON invoices(merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
