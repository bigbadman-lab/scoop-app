-- Phase D.2 — optional Stock News API image URL on provider articles
BEGIN;

ALTER TABLE provider_news_articles
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMIT;
