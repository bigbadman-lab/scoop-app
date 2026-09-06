-- Phase 6B.2 — Minimal Tiingo news ingestion (internal / server-only)
-- No anon/authenticated SELECT. No public /news surface.
-- Does not store API tokens.

BEGIN;

CREATE TABLE IF NOT EXISTS provider_news_articles (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_domain TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT,
  provider_published_at TIMESTAMPTZ NOT NULL,
  provider_crawled_at TIMESTAMPTZ NOT NULL,
  provider_tickers TEXT[] NOT NULL DEFAULT '{}',
  provider_tags TEXT[] NOT NULL DEFAULT '{}',
  crawl_publish_lag_seconds INT,
  is_backfill_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  content_hash TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_article_id)
);

CREATE INDEX IF NOT EXISTS provider_news_articles_crawled_at_idx
  ON provider_news_articles (provider_crawled_at DESC);

CREATE INDEX IF NOT EXISTS provider_news_articles_published_at_idx
  ON provider_news_articles (provider_published_at DESC);

CREATE INDEX IF NOT EXISTS provider_news_articles_provider_idx
  ON provider_news_articles (provider);

CREATE INDEX IF NOT EXISTS provider_news_articles_source_domain_idx
  ON provider_news_articles (source_domain);

CREATE TABLE IF NOT EXISTS news_ingestion_checkpoints (
  provider TEXT PRIMARY KEY,
  last_crawl_date TIMESTAMPTZ,
  last_provider_article_id TEXT,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO news_ingestion_checkpoints (provider, updated_at)
VALUES ('tiingo', NOW())
ON CONFLICT (provider) DO NOTHING;

-- Internal-only: enable RLS, revoke public/anon access, no SELECT policies
ALTER TABLE provider_news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_ingestion_checkpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON provider_news_articles FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON news_ingestion_checkpoints FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
