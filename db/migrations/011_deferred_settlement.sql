ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS settlement_scheduled_at TIMESTAMPTZ;
