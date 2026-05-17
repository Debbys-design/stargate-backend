CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard','pro','enterprise')),
  fee_bps INT NOT NULL DEFAULT 50,
  fee_fixed_usdc NUMERIC(18,7) NOT NULL DEFAULT 0.25,
  muxed_base_id BIGINT UNIQUE,
  stellar_address TEXT,
  settlement_cadence TEXT NOT NULL DEFAULT 'daily' CHECK (settlement_cadence IN ('daily','weekly')),
  kyb_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
