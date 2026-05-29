CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  created_by UUID,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, email)
);

CREATE INDEX IF NOT EXISTS team_members_merchant_idx ON team_members(merchant_id);
CREATE INDEX IF NOT EXISTS team_members_email_idx ON team_members(email);
CREATE INDEX IF NOT EXISTS team_members_invite_token_idx ON team_members(invite_token_hash) WHERE invite_token_hash IS NOT NULL;
