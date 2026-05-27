ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS daily_spend_limit_usdc  NUMERIC(18,7),
  ADD COLUMN IF NOT EXISTS monthly_spend_limit_usdc NUMERIC(18,7);
