-- Add composite index for invoice listing filters (merchant_id, status, created_at)
CREATE INDEX IF NOT EXISTS invoices_merchant_status_created_idx ON invoices(merchant_id, status, created_at DESC);
