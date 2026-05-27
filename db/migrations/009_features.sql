-- #27 Per-endpoint webhook signing secret rotation
ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS previous_secret TEXT,
  ADD COLUMN IF NOT EXISTS secret_rotated_at TIMESTAMPTZ;

-- #36 Payment link analytics
CREATE TABLE IF NOT EXISTS payment_link_events (
  id BIGSERIAL PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'attempt', 'conversion')),
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_link_events_invoice_idx ON payment_link_events(invoice_id);
CREATE INDEX IF NOT EXISTS payment_link_events_merchant_idx ON payment_link_events(merchant_id, event_type);

-- #39 Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  merchant_id UUID REFERENCES merchants(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_merchant_idx ON audit_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor);

-- #29 Idempotency keys for payment intent creation
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  request_hash TEXT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx ON idempotency_keys(created_at);
