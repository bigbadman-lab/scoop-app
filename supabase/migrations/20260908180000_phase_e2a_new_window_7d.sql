-- Phase E.2a-fix: NEW discovery window default = 7 days (604800s).
-- Product API queries parameterize the window via DEFAULT_NEW_WINDOW_SECONDS;
-- keep SQL views' fallback aligned.

CREATE OR REPLACE VIEW launch_discovery AS
SELECT
  l.chain_id,
  l.token_address,
  l.pool_id,
  l.launched_at,
  l.creator_id,
  l.quote_asset,
  m.launch_progress_bps,
  m.launch_complete,
  m.price_quote_x18,
  m.volume_24h_quote_raw,
  m.trade_count_24h,
  m.holder_count_all,
  m.holder_count_retail,
  m.last_trade_at,
  (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
  (
    l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - COALESCE(
      NULLIF(current_setting('scoop.new_window_seconds', true), '')::INT,
      604800
    ))
  ) AS is_new,
  (m.launch_progress_bps >= COALESCE(
      NULLIF(current_setting('scoop.soon_threshold_bps', true), '')::INT,
      8000
    )
    AND m.launch_complete = FALSE
  ) AS is_soon,
  (m.launch_complete = TRUE) AS is_bonded
FROM launches l
LEFT JOIN token_market_state m
  ON m.chain_id = l.chain_id AND m.token_address = l.token_address;

CREATE OR REPLACE VIEW public_token_discovery AS
SELECT
  l.chain_id,
  l.token_address,
  t.name,
  t.symbol,
  t.decimals,
  t.image_uri,
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
