-- Durable server-owned intents for news ↔ market linking.
-- Browser may accelerate activation; correctness does not depend on the tab staying open.

BEGIN;

CREATE TABLE IF NOT EXISTS news_article_market_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL,
  token_address TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_article_id TEXT NOT NULL,
  draft_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'failed', 'expired')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, token_address)
);

CREATE INDEX IF NOT EXISTS news_article_market_intents_status_idx
  ON news_article_market_intents (status, updated_at ASC);

CREATE INDEX IF NOT EXISTS news_article_market_intents_article_idx
  ON news_article_market_intents (provider, provider_article_id);

ALTER TABLE news_article_market_intents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON news_article_market_intents FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
