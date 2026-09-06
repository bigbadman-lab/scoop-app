-- Phase 6A.7 — Production data layer
-- Additive only: performance indexes, product views, RLS grants, realtime publication.
-- Safe on local plain Postgres: realtime / role grants wrapped in exception handlers.
--
-- Product principle:
--   The frontend does not read raw blockchain events directly.
--   The indexer/database layer is the canonical product data interface.
--   Views expose curated shapes; raw_chain_events / indexer_checkpoints /
--   processed_blocks are NOT granted to anon/authenticated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Performance indexes (IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- Discovery / rankings sorts
CREATE INDEX IF NOT EXISTS token_market_state_volume_24h_idx
  ON token_market_state (chain_id, volume_24h_quote_raw DESC);

CREATE INDEX IF NOT EXISTS token_market_state_fdv_idx
  ON token_market_state (chain_id, fdv_usd_x18 DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS token_market_state_progress_idx
  ON token_market_state (chain_id, launch_progress_bps DESC)
  WHERE launch_complete = FALSE;

CREATE INDEX IF NOT EXISTS token_market_state_bonded_idx
  ON token_market_state (chain_id, token_address)
  WHERE launch_complete = TRUE;

CREATE INDEX IF NOT EXISTS token_market_state_holders_idx
  ON token_market_state (chain_id, holder_count_retail DESC);

CREATE INDEX IF NOT EXISTS token_market_state_trades_24h_idx
  ON token_market_state (chain_id, trade_count_24h DESC);

CREATE INDEX IF NOT EXISTS token_market_state_price_change_idx
  ON token_market_state (chain_id, price_change_24h_bps DESC NULLS LAST);

-- Trades pagination (token + time + log)
CREATE INDEX IF NOT EXISTS trades_token_ts_log_idx
  ON trades (chain_id, token_address, block_timestamp DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS trades_token_side_ts_idx
  ON trades (chain_id, token_address, side, block_timestamp DESC);

-- Holders rank (already have holder_balances_rank_idx; reinforce retail filter)
CREATE INDEX IF NOT EXISTS holder_balances_retail_rank_idx
  ON holder_balances (chain_id, token_address, balance_raw DESC)
  WHERE is_system_address = FALSE AND holder_class = 'user';

-- Candles range queries
CREATE INDEX IF NOT EXISTS candles_token_interval_bucket_idx
  ON candles (chain_id, token_address, interval, bucket_start DESC);

-- Creator earnings
CREATE INDEX IF NOT EXISTS creator_credits_creator_idx
  ON creator_credits (chain_id, creator_id, asset_kind, asset_address);

CREATE INDEX IF NOT EXISTS creator_claims_creator_idx
  ON creator_claims (chain_id, creator_id, asset_kind, asset_address);

CREATE INDEX IF NOT EXISTS creator_claimable_creator_idx
  ON creator_claimable_state (chain_id, creator_id);

-- ---------------------------------------------------------------------------
-- 2. Stable product views
-- ---------------------------------------------------------------------------

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
  (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - 86400)) AS is_new,
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

CREATE OR REPLACE VIEW public_token_detail AS
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

CREATE OR REPLACE VIEW public_indexer_health AS
SELECT
  chain_id,
  heartbeat_at,
  latest_indexed_block,
  chain_latest,
  chain_safe,
  chain_finalized,
  lag_blocks,
  last_rpc_ok_at,
  reorg_count,
  dirty_projections,
  watchlist_size,
  active_rpc,
  ws_connected,
  notes,
  updated_at
FROM indexer_health;

-- ---------------------------------------------------------------------------
-- 3. RLS — enable on product tables; grant SELECT on views to anon/authenticated
--    NO write for anon. Do NOT expose raw ingest / checkpoint tables.
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holder_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS token_market_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_claimable_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fee_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS quote_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS indexer_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS address_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS protocol_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS quote_assets ENABLE ROW LEVEL SECURITY;

-- Keep ingest / control-plane tables RLS-enabled with no anon policies
ALTER TABLE IF EXISTS raw_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS indexer_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS processed_blocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Read policies for authenticated service paths via views (and curated tables).
  -- Local Postgres without Supabase roles: skip grants quietly.
  BEGIN
    GRANT SELECT ON public_token_discovery TO anon, authenticated;
    GRANT SELECT ON public_token_detail TO anon, authenticated;
    GRANT SELECT ON public_indexer_health TO anon, authenticated;
  EXCEPTION
    WHEN undefined_object THEN NULL; -- role does not exist
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    GRANT SELECT ON tokens TO anon, authenticated;
    GRANT SELECT ON launches TO anon, authenticated;
    GRANT SELECT ON pools TO anon, authenticated;
    GRANT SELECT ON trades TO anon, authenticated;
    GRANT SELECT ON holder_balances TO anon, authenticated;
    GRANT SELECT ON token_market_state TO anon, authenticated;
    GRANT SELECT ON candles TO anon, authenticated;
    GRANT SELECT ON creators TO anon, authenticated;
    GRANT SELECT ON creator_claimable_state TO anon, authenticated;
    GRANT SELECT ON indexer_health TO anon, authenticated;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Explicitly revoke any public/anon access to raw ingest tables
  BEGIN
    REVOKE ALL ON raw_chain_events FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON indexer_checkpoints FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON processed_blocks FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Permissive SELECT policies so GRANT + RLS work for anon on curated tables
  BEGIN
    CREATE POLICY tokens_select_anon ON tokens FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY launches_select_anon ON launches FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY pools_select_anon ON pools FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY trades_select_anon ON trades FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY holders_select_anon ON holder_balances FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY market_select_anon ON token_market_state FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY candles_select_anon ON candles FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY creators_select_anon ON creators FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY claimable_select_anon ON creator_claimable_state FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN
    CREATE POLICY health_select_anon ON indexer_health FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Realtime publication (Supabase). No-op on local plain Postgres.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE launches;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL; -- publication missing
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trades;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE token_market_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE candles;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creator_credits;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creator_claimable_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

COMMIT;
