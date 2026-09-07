-- Read-only verification for canonical 22-asset quote catalogue
-- Expected after applying 20260907120000_phase_6c_quote_catalogue.sql
-- Do NOT run as a migration.

-- Count of live registered+enabled quotes on Robinhood Chain
-- Expected: 22
SELECT COUNT(*) AS enabled_quote_count
FROM quote_assets
WHERE chain_id = 4663
  AND is_registered = TRUE
  AND is_enabled = TRUE;

-- Full catalogue in product sort order
-- Expected: ETH, USDG, then 20 stocks AAPL..TSM
SELECT
  sort_order,
  symbol,
  display_symbol,
  name,
  category,
  quote_type,
  quote_asset,
  image_url,
  source_name,
  is_registered,
  is_enabled
FROM quote_assets
WHERE chain_id = 4663
ORDER BY sort_order;

-- Public view (product-safe columns only; no oracle fields)
-- Expected: 22 rows when all seeded rows are registered+enabled
SELECT *
FROM public_quote_catalogue
WHERE chain_id = 4663
  AND is_registered = TRUE
  AND is_enabled = TRUE
ORDER BY sort_order;

-- Image sanity: stocks should have Robinhood CDN URLs; ETH/USDG may be NULL
SELECT
  symbol,
  category,
  image_url IS NOT NULL AS has_image,
  image_url = source_image_url AS image_matches_source
FROM quote_assets
WHERE chain_id = 4663
ORDER BY sort_order;
