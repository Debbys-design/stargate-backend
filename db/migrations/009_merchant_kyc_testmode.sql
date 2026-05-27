ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT FALSE;
