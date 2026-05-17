CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount_usdc NUMERIC(18,7) NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','confirmed','failed')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_settlement_fk
  FOREIGN KEY (settlement_id) REFERENCES settlements(id);
