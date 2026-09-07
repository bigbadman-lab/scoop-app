-- Verification for 22/22 SCOOP-hosted quote asset images
-- Expected after ETH/USDG + stock image SQL have been applied manually.

-- Count of rows with an image_url
-- Expected: 22
SELECT COUNT(*) AS quote_images_ready
FROM quote_assets
WHERE chain_id = 4663
  AND image_url IS NOT NULL;

-- Every image_url should be SCOOP Supabase Storage
-- Expected: 22
SELECT COUNT(*) AS scoop_hosted
FROM quote_assets
WHERE chain_id = 4663
  AND image_url LIKE '%/storage/v1/object/public/quote-assets/4663/%';

-- Native provenance
-- ETH source_name = ethereum, USDG source_name = global-dollar
SELECT symbol, source_name, image_url, source_image_url
FROM quote_assets
WHERE chain_id = 4663
  AND symbol IN ('ETH', 'USDG')
ORDER BY sort_order;

-- Stock issuer source_name distribution (not robinhood)
-- Expected: 20 rows with issuer identifiers
SELECT symbol, source_name, source_image_url IS NULL AS source_image_url_null
FROM quote_assets
WHERE chain_id = 4663
  AND category = 'stock'
ORDER BY symbol;

-- Manual four may have NULL source_image_url
-- Expected symbols: GME, MSTR, SNDK, TSM
SELECT symbol, source_name, source_image_url, image_url
FROM quote_assets
WHERE chain_id = 4663
  AND symbol IN ('GME', 'MSTR', 'SNDK', 'TSM')
ORDER BY symbol;

-- Full catalogue image state
-- Expected: 22 rows
SELECT
  sort_order,
  symbol,
  image_url,
  source_image_url,
  source_name
FROM quote_assets
WHERE chain_id = 4663
ORDER BY sort_order;
