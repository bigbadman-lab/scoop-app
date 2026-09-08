-- Phase C.3a — Canonical SCOOP account identity (users / wallets / profiles)
-- Additive only. No seed users. No auth-identity provider table (deferred).

BEGIN;

CREATE TABLE IF NOT EXISTS scoop_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scoop_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES scoop_users(id) ON DELETE CASCADE,
  address CHAR(42) NOT NULL,
  chain_family TEXT NOT NULL DEFAULT 'eip155'
    CHECK (chain_family IN ('eip155')),
  wallet_type TEXT NOT NULL
    CHECK (wallet_type IN ('external', 'embedded')),
  provider TEXT
    CHECK (
      provider IS NULL
      OR provider IN ('injected', 'walletconnect', 'reown_email', 'auth', 'unknown')
    ),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scoop_wallets_address_format_chk
    CHECK (address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT scoop_wallets_address_unique UNIQUE (address)
);

CREATE INDEX IF NOT EXISTS scoop_wallets_user_id_idx
  ON scoop_wallets (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS scoop_wallets_one_primary_per_user_idx
  ON scoop_wallets (user_id)
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS scoop_profiles (
  user_id UUID PRIMARY KEY REFERENCES scoop_users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE scoop_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoop_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoop_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON scoop_users FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON scoop_wallets FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON scoop_profiles FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
