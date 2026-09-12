-- Phase N4B.1 — canonical news feed membership on provider articles
-- Additive only. Does not change UNIQUE (provider, provider_article_id).
-- Article provider identity remains `stocknewsapi`; Markets checkpoint uses
-- logical key `stocknewsapi:markets` (separate table row, not article provider).

BEGIN;

ALTER TABLE provider_news_articles
  ADD COLUMN IF NOT EXISTS feed_categories TEXT[] NOT NULL DEFAULT '{}';

-- Supported values only; reject NULL array elements.
ALTER TABLE provider_news_articles
  DROP CONSTRAINT IF EXISTS provider_news_articles_feed_categories_valid;

ALTER TABLE provider_news_articles
  ADD CONSTRAINT provider_news_articles_feed_categories_valid
  CHECK (
    feed_categories <@ ARRAY['stocks', 'markets']::text[]
    AND array_position(feed_categories, NULL) IS NULL
  );

CREATE INDEX IF NOT EXISTS provider_news_articles_feed_categories_gin_idx
  ON provider_news_articles USING GIN (feed_categories);

-- Backfill Stocks membership for rows that match public stockRelevantOnly
-- eligibility (excluding backfill candidates, matching /news display set).
-- Idempotent: adds 'stocks' without removing other categories; dedupes.
UPDATE provider_news_articles
SET feed_categories = (
  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[])
  FROM unnest(feed_categories || ARRAY['stocks']::text[]) AS c
)
WHERE is_backfill_candidate = FALSE
  AND (
    (
      market_relevance_score IS NOT NULL
      AND market_relevance_score >= 20
      AND relevance_class IS NOT NULL
      AND relevance_class <> 'reject'
    )
    OR (
      market_relevance_score IS NULL
      AND cardinality(provider_tickers) > 0
    )
  )
  AND NOT ('stocks' = ANY (feed_categories));

COMMIT;
