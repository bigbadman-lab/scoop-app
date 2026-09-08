-- Phase E.1c: universal USD valuation — 24h USD volume + snapshot lookup index.
-- Trade/candle USD columns already exist (nullable). No destructive changes.

BEGIN;

ALTER TABLE token_market_state
  ADD COLUMN IF NOT EXISTS volume_24h_usd_x18 NUMERIC(78,0);

COMMENT ON COLUMN token_market_state.volume_24h_usd_x18 IS
  'SUM(trades.usd_value_x18) over last 24h when every trade in the window has a USD notional; null if coverage incomplete.';

CREATE INDEX IF NOT EXISTS quote_price_snapshots_asset_observed_idx
  ON quote_price_snapshots (chain_id, quote_asset, observed_at DESC);

COMMIT;
