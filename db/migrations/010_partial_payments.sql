ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paid_usdc NUMERIC(18,7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_remaining_usdc NUMERIC(18,7),
  ADD COLUMN IF NOT EXISTS partial_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Initialise remaining = gross for existing rows
UPDATE invoices SET amount_remaining_usdc = gross_usdc WHERE amount_remaining_usdc IS NULL;

ALTER TABLE invoices
  ALTER COLUMN amount_remaining_usdc SET NOT NULL,
  ADD CONSTRAINT invoices_status_partial CHECK (
    status IN ('pending','partial','paid','expired','cancelled')
  );

-- Drop old status constraint and replace (Postgres allows multiple CHECK constraints)
-- The new status value 'partial' is now valid via the constraint above.
