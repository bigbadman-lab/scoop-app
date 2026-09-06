-- Phase 6B.4 — Launch drafts + temporary artwork assets (internal)
-- No public anon access. Image bytes live in Storage, not Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS launch_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('news', 'standard')),
  provider TEXT,
  provider_article_id TEXT,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  description TEXT NOT NULL,
  quote_asset_address TEXT NOT NULL,
  quote_asset_symbol TEXT NOT NULL,
  concept_image_direction TEXT NOT NULL DEFAULT '',
  selected_artwork_asset_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS launch_drafts_article_idx
  ON launch_drafts (provider, provider_article_id);

CREATE INDEX IF NOT EXISTS launch_drafts_updated_at_idx
  ON launch_drafts (updated_at DESC);

CREATE TABLE IF NOT EXISTS launch_draft_artworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES launch_drafts(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL,
  style_id TEXT NOT NULL CHECK (style_id IN ('art_1', 'art_2', 'art_3')),
  style TEXT NOT NULL CHECK (style IN ('iconic', 'memetic', 'editorial_abstract')),
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INT NOT NULL DEFAULT 1024,
  height INT NOT NULL DEFAULT 1024,
  model TEXT NOT NULL,
  quality TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, generation_id, style_id)
);

CREATE INDEX IF NOT EXISTS launch_draft_artworks_draft_idx
  ON launch_draft_artworks (draft_id, created_at DESC);

ALTER TABLE launch_drafts
  DROP CONSTRAINT IF EXISTS launch_drafts_selected_artwork_fkey;

ALTER TABLE launch_drafts
  ADD CONSTRAINT launch_drafts_selected_artwork_fkey
  FOREIGN KEY (selected_artwork_asset_id)
  REFERENCES launch_draft_artworks(id)
  ON DELETE SET NULL;

ALTER TABLE launch_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_draft_artworks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON launch_drafts FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON launch_draft_artworks FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Private storage bucket for temporary draft artwork (service-role only)
-- Skip quietly if storage schema is unavailable (non-Supabase local Postgres).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'launch-draft-assets',
      'launch-draft-assets',
      FALSE,
      10485760,
      ARRAY['image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

COMMIT;
