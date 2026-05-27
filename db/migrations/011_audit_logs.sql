CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  action TEXT NOT NULL CHECK (action IN ('api_key_created', 'api_key_rotated', 'api_key_deactivated', 'webhook_created', 'webhook_rotated', 'webhook_deactivated', 'webhook_retried')),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('api_key', 'webhook')),
  resource_id UUID NOT NULL,
  actor_ip TEXT,
  actor_email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_merchant_idx ON audit_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
