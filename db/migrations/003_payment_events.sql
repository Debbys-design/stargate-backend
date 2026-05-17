CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  paging_token TEXT UNIQUE NOT NULL,
  invoice_id UUID REFERENCES invoices(id),
  payer_address TEXT NOT NULL,
  amount_usdc NUMERIC(18,7) NOT NULL,
  asset_code TEXT NOT NULL,
  asset_issuer TEXT NOT NULL,
  memo TEXT,
  muxed_id BIGINT,
  stellar_tx_hash TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  ofac_result TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_events_invoice_id_idx ON payment_events(invoice_id);
CREATE INDEX IF NOT EXISTS payment_events_paging_token_idx ON payment_events(paging_token);
