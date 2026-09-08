-- Phase E.2a-fix3: SCOOP-controlled token display image URL.
-- Canonical tokens.image_uri (IPFS) is preserved; display_image_url is HTTPS CDN only.

BEGIN;

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS display_image_url TEXT;

COMMENT ON COLUMN tokens.display_image_url IS
  'SCOOP-controlled HTTPS display copy (Supabase Storage token-image). Nullable; never replaces image_uri.';

ALTER TABLE launch_draft_artworks
  ADD COLUMN IF NOT EXISTS display_image_url TEXT,
  ADD COLUMN IF NOT EXISTS display_image_path TEXT;

COMMENT ON COLUMN launch_draft_artworks.display_image_url IS
  'Public HTTPS URL for SCOOP display copy uploaded to token-image bucket.';
COMMENT ON COLUMN launch_draft_artworks.display_image_path IS
  'Object path inside token-image bucket (server-derived).';

-- HELLO manual backfill only — preserve canonical IPFS image_uri.
UPDATE tokens
SET display_image_url = 'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png',
    updated_at = NOW()
WHERE chain_id = 4663
  AND token_address = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373'
  AND (
    display_image_url IS NULL
    OR display_image_url IS DISTINCT FROM
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png'
  );

-- Keep public discovery views aligned (optional consumers).
-- CREATE OR REPLACE cannot insert mid-list columns (PG maps by position),
-- so drop dependents and recreate.
DROP VIEW IF EXISTS public_token_detail;
DROP VIEW IF EXISTS public_token_discovery;

CREATE VIEW public_token_discovery AS
SELECT
  l.chain_id,
  l.token_address,
  t.name,
  t.symbol,
  t.decimals,
  t.image_uri,
  t.display_image_url,
  l.pool_id,
  l.creator_id,
  l.quote_asset,
  l.launched_at,
  (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
  COALESCE(m.launch_progress_bps, 0) AS launch_progress_bps,
  COALESCE(m.launch_complete, FALSE) AS launch_complete,
  (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - 604800)) AS is_new,
  (
    COALESCE(m.launch_progress_bps, 0) >= 8000
    AND COALESCE(m.launch_complete, FALSE) = FALSE
  ) AS is_soon,
  (COALESCE(m.launch_complete, FALSE) = TRUE) AS is_bonded,
  m.price_quote_x18,
  m.fdv_usd_x18,
  m.volume_24h_quote_raw,
  m.trade_count_24h,
  m.holder_count_all,
  m.holder_count_retail,
  m.last_trade_at,
  m.price_change_24h_bps
FROM launches l
INNER JOIN tokens t
  ON t.chain_id = l.chain_id AND t.token_address = l.token_address
LEFT JOIN token_market_state m
  ON m.chain_id = l.chain_id AND m.token_address = l.token_address;

CREATE VIEW public_token_detail AS
SELECT
  d.*,
  t.description,
  t.twitter,
  t.telegram,
  t.discord,
  t.website,
  t.farcaster,
  t.total_supply_raw,
  t.deployer_address,
  l.factory_address,
  l.fee_distributor_address,
  l.liquidity_locker_address,
  m.sqrt_price_x96,
  m.tick,
  m.liquidity_raw,
  m.price_usd_x18,
  m.quote_usd_x18,
  m.quote_volume_all_time_raw,
  m.token_volume_all_time_raw,
  m.trade_count_all_time,
  m.buy_count_all_time,
  m.sell_count_all_time,
  m.initial_token_inventory_raw,
  m.current_token_inventory_raw,
  m.source_block
FROM public_token_discovery d
INNER JOIN tokens t
  ON t.chain_id = d.chain_id AND t.token_address = d.token_address
INNER JOIN launches l
  ON l.chain_id = d.chain_id AND l.token_address = d.token_address
LEFT JOIN token_market_state m
  ON m.chain_id = d.chain_id AND m.token_address = d.token_address;

DO $$
BEGIN
  BEGIN
    GRANT SELECT ON public_token_discovery TO anon, authenticated;
    GRANT SELECT ON public_token_detail TO anon, authenticated;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Do NOT recreate bucket `token-image` — already provisioned in production.
-- Ensure public + image MIME allow-list when storage schema is present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    UPDATE storage.buckets
    SET public = TRUE,
        file_size_limit = COALESCE(file_size_limit, 10485760),
        allowed_mime_types = COALESCE(
          allowed_mime_types,
          ARRAY['image/png', 'image/webp', 'image/jpeg']
        )
    WHERE id = 'token-image';
  END IF;
END $$;

COMMIT;
