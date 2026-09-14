-- Pin-time intents for server-owned token display finalization.
-- Match awaiting intents to indexed tokens via canonical image_uri (logo),
-- then reconcile without requiring a post-launch browser request.

BEGIN;

CREATE TABLE IF NOT EXISTS token_display_finalize_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER,
  token_address TEXT,
  draft_id UUID,
  display_image_path TEXT,
  image_uri TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_token'
    CHECK (status IN ('awaiting_token', 'pending', 'done', 'failed', 'expired', 'noop')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT token_display_finalize_intents_token_pair_chk
    CHECK (
      (chain_id IS NULL AND token_address IS NULL)
      OR (chain_id IS NOT NULL AND token_address IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS token_display_finalize_intents_status_idx
  ON token_display_finalize_intents (status, updated_at ASC);

CREATE INDEX IF NOT EXISTS token_display_finalize_intents_image_uri_idx
  ON token_display_finalize_intents (image_uri)
  WHERE status IN ('awaiting_token', 'pending');

CREATE UNIQUE INDEX IF NOT EXISTS token_display_finalize_intents_token_uidx
  ON token_display_finalize_intents (chain_id, token_address)
  WHERE token_address IS NOT NULL AND status IN ('awaiting_token', 'pending');

ALTER TABLE token_display_finalize_intents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON token_display_finalize_intents FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
