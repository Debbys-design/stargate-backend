CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount_usdc NUMERIC(18,7) NOT NULL,
  gross_usdc NUMERIC(18,7) NOT NULL,
  fee_usdc NUMERIC(18,7) NOT NULL,
  net_usdc NUMERIC(18,7) NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  muxed_id BIGINT UNIQUE NOT NULL,
  muxed_address TEXT NOT NULL,
  memo TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_merchant_status_idx ON invoices(merchant_id, status);
CREATE INDEX IF NOT EXISTS invoices_muxed_id_idx ON invoices(muxed_id);
CREATE INDEX IF NOT EXISTS invoices_pending_expiry_idx ON invoices(status, expires_at) WHERE status = 'pending';
