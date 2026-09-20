-- Gate E — Solana / Pump market persistence (additive, reversible-friendly)
-- Widens identity columns so base58 mints + Solana signatures fit.
-- Seeds Solana mainnet product chain_id (PK requires chain_id; not a CAIP substitute).
-- Extends market_source with 'pump'. Relaxes Scoop-only fee CHECK for pons_v2/pump.
-- Does NOT rewrite historical Robinhood rows. Does NOT touch trades/holders/fee-keeper.
--
-- Dependency-safe ALTER: drop views that reference widened columns, alter, recreate.
-- No CASCADE. Production view bodies captured 2026-09-21 (read-only pg_get_viewdef).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Drop dependents (reverse dependency order). No CASCADE.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_token_detail;
DROP VIEW IF EXISTS public.public_token_discovery;
DROP VIEW IF EXISTS public.launch_discovery;

-- ---------------------------------------------------------------------------
-- 1. Product chain registry: Robinhood stays eip155; Solana is a sibling family.
-- ---------------------------------------------------------------------------
ALTER TABLE chains
  ADD COLUMN IF NOT EXISTS chain_family TEXT NOT NULL DEFAULT 'eip155';

ALTER TABLE chains
  DROP CONSTRAINT IF EXISTS chains_chain_family_check;

ALTER TABLE chains
  ADD CONSTRAINT chains_chain_family_check
  CHECK (chain_family IN ('eip155', 'solana'));

UPDATE chains
SET chain_family = 'eip155'
WHERE chain_id = 4663 AND (chain_family IS NULL OR chain_family = '');

-- Documented SCOOP product sentinel for Solana mainnet-beta (PK needs a BIGINT).
-- Not a fake EVM chain — readers must gate on chain_family / market_source.
INSERT INTO chains (chain_id, name, native_symbol, is_active, chain_family)
VALUES (900001, 'Solana Mainnet', 'SOL', TRUE, 'solana')
ON CONFLICT (chain_id) DO UPDATE
SET name = EXCLUDED.name,
    native_symbol = EXCLUDED.native_symbol,
    is_active = EXCLUDED.is_active,
    chain_family = EXCLUDED.chain_family;

-- ---------------------------------------------------------------------------
-- 2. Widen shared identity columns (CHAR(42)/CHAR(66) → TEXT). No truncation.
-- ---------------------------------------------------------------------------
ALTER TABLE tokens
  ALTER COLUMN token_address TYPE TEXT USING token_address::TEXT;

ALTER TABLE tokens
  ALTER COLUMN deployer_address TYPE TEXT USING deployer_address::TEXT;

ALTER TABLE tokens
  ALTER COLUMN launch_factory_address TYPE TEXT USING launch_factory_address::TEXT;

ALTER TABLE launches
  ALTER COLUMN token_address TYPE TEXT USING token_address::TEXT;

ALTER TABLE launches
  ALTER COLUMN factory_address TYPE TEXT USING factory_address::TEXT;

ALTER TABLE launches
  ALTER COLUMN deployer_address TYPE TEXT USING deployer_address::TEXT;

ALTER TABLE launches
  ALTER COLUMN creator_id TYPE TEXT USING creator_id::TEXT;

ALTER TABLE launches
  ALTER COLUMN quote_asset TYPE TEXT USING quote_asset::TEXT;

ALTER TABLE launches
  ALTER COLUMN launch_tx_hash TYPE TEXT USING launch_tx_hash::TEXT;

-- curve_address may hold base58 later; widen now (nullable already).
ALTER TABLE launches
  ALTER COLUMN curve_address TYPE TEXT USING curve_address::TEXT;

-- token_market_state joins on token_address — widen to match tokens PK type.
ALTER TABLE token_market_state
  ALTER COLUMN token_address TYPE TEXT USING token_address::TEXT;

-- ---------------------------------------------------------------------------
-- 3. market_source + fee CHECK + indexes
-- ---------------------------------------------------------------------------
ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_market_source_check;

ALTER TABLE launches
  ADD CONSTRAINT launches_market_source_check
  CHECK (market_source IN ('scoop', 'pons_v2', 'pump'));

-- Scoop UV4 fee identity does not apply to Pons/Pump. Allow 0/0 for those sources.
ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_total_pool_fee_check;

ALTER TABLE launches
  ADD CONSTRAINT launches_total_pool_fee_check
  CHECK (
    (
      market_source IN ('pons_v2', 'pump')
      AND additional_fee = 0
      AND total_pool_fee = 0
    )
    OR (
      market_source = 'scoop'
      AND total_pool_fee >= 10000
      AND total_pool_fee <= 30000
      AND total_pool_fee = 10000 + additional_fee
    )
  );

-- Idempotent lookup by Pump signature (mint remains primary key).
CREATE UNIQUE INDEX IF NOT EXISTS launches_pump_launch_tx_hash_unique
  ON launches (chain_id, launch_tx_hash)
  WHERE market_source = 'pump';

CREATE INDEX IF NOT EXISTS chains_chain_family_idx
  ON chains (chain_family);

-- ---------------------------------------------------------------------------
-- 4. Recreate views (production bodies; ownership defaults to migrator role).
--    No security_invoker / security_barrier options were set in production.
-- ---------------------------------------------------------------------------

CREATE VIEW public.launch_discovery AS
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
  (
    m.launch_progress_bps >= COALESCE(
      NULLIF(current_setting('scoop.soon_threshold_bps', true), '')::INT,
      8000
    )
    AND m.launch_complete = FALSE
  ) AS is_soon,
  (m.launch_complete = TRUE) AS is_bonded
FROM launches l
LEFT JOIN token_market_state m
  ON m.chain_id = l.chain_id AND m.token_address = l.token_address;

CREATE VIEW public.public_token_discovery AS
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

CREATE VIEW public.public_token_detail AS
SELECT
  d.chain_id,
  d.token_address,
  d.name,
  d.symbol,
  d.decimals,
  d.image_uri,
  d.display_image_url,
  d.pool_id,
  d.creator_id,
  d.quote_asset,
  d.launched_at,
  d.age_seconds,
  d.launch_progress_bps,
  d.launch_complete,
  d.is_new,
  d.is_soon,
  d.is_bonded,
  d.price_quote_x18,
  d.fdv_usd_x18,
  d.volume_24h_quote_raw,
  d.trade_count_24h,
  d.holder_count_all,
  d.holder_count_retail,
  d.last_trade_at,
  d.price_change_24h_bps,
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
FROM public.public_token_discovery d
INNER JOIN tokens t
  ON t.chain_id = d.chain_id AND t.token_address = d.token_address
INNER JOIN launches l
  ON l.chain_id = d.chain_id AND l.token_address = d.token_address
LEFT JOIN token_market_state m
  ON m.chain_id = d.chain_id AND m.token_address = d.token_address;

-- ---------------------------------------------------------------------------
-- 5. Restore privileges (match production GRANT ALL to API roles).
-- ---------------------------------------------------------------------------
GRANT ALL PRIVILEGES ON TABLE public.launch_discovery
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.public_token_discovery
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.public_token_detail
  TO anon, authenticated, service_role;

COMMIT;
