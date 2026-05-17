CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  event_id BIGINT NOT NULL REFERENCES payment_events(id),
  gross_usdc NUMERIC(18,7) NOT NULL,
  fee_usdc NUMERIC(18,7) NOT NULL,
  net_usdc NUMERIC(18,7) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payment','refund','fee','settlement')),
  settlement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
