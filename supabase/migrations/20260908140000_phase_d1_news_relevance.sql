-- Phase D.1 — stock relevance metadata for ingested news
-- Does not change UNIQUE (provider, provider_article_id) dedupe.

BEGIN;

ALTER TABLE provider_news_articles
  ADD COLUMN IF NOT EXISTS market_relevance_score REAL,
  ADD COLUMN IF NOT EXISTS relevance_class TEXT,
  ADD COLUMN IF NOT EXISTS relevance_reasons TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS provider_news_articles_relevance_score_idx
  ON provider_news_articles (market_relevance_score DESC NULLS LAST, provider_published_at DESC);

COMMIT;
