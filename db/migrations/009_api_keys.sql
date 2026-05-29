CREATE TYPE api_key_scope AS ENUM ('read_only', 'webhooks', 'full_access');

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scope api_key_scope NOT NULL DEFAULT 'read_only',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_merchant_id_idx ON api_keys(merchant_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
