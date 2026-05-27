CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount_usdc NUMERIC(18,7) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','settled','failed')),
  soroban_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refunds_invoice_idx ON refunds(invoice_id);
CREATE INDEX IF NOT EXISTS refunds_merchant_idx ON refunds(merchant_id);
