CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  recipient TEXT NOT NULL,
  amount_usdc NUMERIC(18,7) NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('daily','weekly','monthly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_schedules_merchant_idx ON recurring_schedules(merchant_id);
CREATE INDEX IF NOT EXISTS recurring_schedules_next_run_idx ON recurring_schedules(status, next_run_at) WHERE status = 'active';
