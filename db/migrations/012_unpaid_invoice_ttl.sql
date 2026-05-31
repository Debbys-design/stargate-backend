ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS unpaid_invoice_ttl_minutes INT NOT NULL DEFAULT 60;

CREATE INDEX IF NOT EXISTS merchants_unpaid_invoice_ttl_idx ON merchants (unpaid_invoice_ttl_minutes);

