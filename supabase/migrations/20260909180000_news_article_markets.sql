-- News Page V2 — one article → many indexed markets (explicit provenance only).
-- Activation: app writes after launch is present in `launches` (indexed).
-- Indexer does not touch this table.

BEGIN;

CREATE TABLE IF NOT EXISTS news_article_markets (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_article_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  token_address TEXT NOT NULL,
  draft_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, token_address)
);

CREATE INDEX IF NOT EXISTS news_article_markets_article_idx
  ON news_article_markets (provider, provider_article_id, created_at DESC);

CREATE INDEX IF NOT EXISTS news_article_markets_token_idx
  ON news_article_markets (chain_id, token_address);

ALTER TABLE news_article_markets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON news_article_markets FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
