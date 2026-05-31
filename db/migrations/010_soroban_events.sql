CREATE TABLE IF NOT EXISTS soroban_contract_events (
  id BIGSERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL,
  paging_token TEXT UNIQUE NOT NULL,
  tx_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]',
  value JSONB,
  invoice_id UUID REFERENCES invoices(id),
  merchant_id UUID REFERENCES merchants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS soroban_events_contract_id_idx ON soroban_contract_events(contract_id);
CREATE INDEX IF NOT EXISTS soroban_events_ledger_idx ON soroban_contract_events(ledger_sequence);
CREATE INDEX IF NOT EXISTS soroban_events_invoice_id_idx ON soroban_contract_events(invoice_id);
CREATE INDEX IF NOT EXISTS soroban_events_merchant_id_idx ON soroban_contract_events(merchant_id);
