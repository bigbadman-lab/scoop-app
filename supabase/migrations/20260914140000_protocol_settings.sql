-- Runtime protocol configuration (operator-set, not build-time).
-- Used for official $TAPE contract address after launch without redeploy.

CREATE TABLE IF NOT EXISTS protocol_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE protocol_settings IS
  'Server-side runtime protocol settings (e.g. tape_official_contract). Not for browser writes.';

COMMENT ON COLUMN protocol_settings.key IS
  'Stable setting key (e.g. tape_official_contract).';

COMMENT ON COLUMN protocol_settings.value IS
  'Setting value (e.g. lowercase EVM address).';

-- Deny PostgREST anon/authenticated by default; operator CLI uses DATABASE_URL.
ALTER TABLE protocol_settings ENABLE ROW LEVEL SECURITY;
