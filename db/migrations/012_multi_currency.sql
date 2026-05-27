-- Add currency column to invoices (default USDC for backward compat)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USDC'
    CHECK (currency IN ('USDC','EURC','XLM'));

-- Store the USDC-equivalent gross at invoice creation time for reconciliation
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gross_usdc_equiv NUMERIC(18,7);

-- Initialise equiv = gross_usdc for existing rows
UPDATE invoices SET gross_usdc_equiv = gross_usdc WHERE gross_usdc_equiv IS NULL;

ALTER TABLE invoices
  ALTER COLUMN gross_usdc_equiv SET NOT NULL;

-- Accepted assets per merchant (NULL = all supported assets)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS accepted_assets TEXT[] DEFAULT NULL;

-- FX rates cache table (updated by the FX service)
CREATE TABLE IF NOT EXISTS fx_rates (
  base_currency  TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'USDC',
  rate           NUMERIC(24,12) NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base_currency, quote_currency)
);

-- Seed initial rates (will be overwritten by live fetches)
INSERT INTO fx_rates (base_currency, quote_currency, rate)
VALUES
  ('USDC', 'USDC', 1.0),
  ('EURC', 'USDC', 1.08),
  ('XLM',  'USDC', 0.11)
ON CONFLICT (base_currency, quote_currency) DO NOTHING;
