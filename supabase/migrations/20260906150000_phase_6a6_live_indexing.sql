-- Phase 6A.6 — live indexing projections + processed block tracking
-- Additive only. Does not rewrite 6A.5 migration.

BEGIN;

ALTER TABLE token_market_state
  ADD COLUMN IF NOT EXISTS launch_progress_bps INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_trade_at BIGINT,
  ADD COLUMN IF NOT EXISTS last_trade_block BIGINT,
  ADD COLUMN IF NOT EXISTS trade_count_all_time INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buy_count_all_time INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_count_all_time INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_volume_all_time_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_volume_all_time_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_24h_quote_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_count_24h INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buy_count_24h INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_count_24h INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_change_24h_bps INT,
  ADD COLUMN IF NOT EXISTS holder_count_all INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holder_count_retail INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_token_inventory_raw NUMERIC(78,0),
  ADD COLUMN IF NOT EXISTS current_token_inventory_raw NUMERIC(78,0);

ALTER TABLE token_market_state
  DROP CONSTRAINT IF EXISTS token_market_state_progress_bps_check;
ALTER TABLE token_market_state
  ADD CONSTRAINT token_market_state_progress_bps_check
  CHECK (launch_progress_bps >= 0 AND launch_progress_bps <= 10000);

-- Processed block hashes for reorg detection (canonical chain window)
CREATE TABLE IF NOT EXISTS processed_blocks (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  parent_hash CHAR(66),
  block_timestamp BIGINT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, block_number)
);

CREATE INDEX IF NOT EXISTS processed_blocks_hash_idx
  ON processed_blocks (chain_id, block_hash);

-- Discovery helpers (views) — NEW/SOON/BONDED are derived filters, not exclusive states
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
      86400
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

-- Extend indexer_health for confirmation heads
ALTER TABLE indexer_health
  ADD COLUMN IF NOT EXISTS chain_finalized BIGINT,
  ADD COLUMN IF NOT EXISTS last_quote_usd_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_rpc TEXT,
  ADD COLUMN IF NOT EXISTS ws_connected BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
