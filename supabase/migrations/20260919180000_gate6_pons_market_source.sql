-- Gate 6 — Pons V2 market_source + pre-graduation nullable UV4 fields
-- Additive / idempotent. Does not rewrite historical rows as Pons.
-- Existing launches remain market_source = 'scoop'.

BEGIN;

-- Explicit source discriminator (preferred over fragile address comparisons).
ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS market_source TEXT NOT NULL DEFAULT 'scoop';

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_market_source_check;

ALTER TABLE launches
  ADD CONSTRAINT launches_market_source_check
  CHECK (market_source IN ('scoop', 'pons_v2'));

-- Pons bonding-curve fields (null for legacy Scoop).
ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS curve_address CHAR(42);

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS launch_config_id NUMERIC(78,0);

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS graduation_threshold_raw NUMERIC(78,0);

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS graduation_status TEXT;

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_graduation_status_check;

ALTER TABLE launches
  ADD CONSTRAINT launches_graduation_status_check
  CHECK (
    graduation_status IS NULL
    OR graduation_status IN ('curve', 'graduated')
  );

-- Pre-graduation Pons markets have no UV4 pool / Scoop fee plumbing.
-- Make UV4-at-launch columns nullable; legacy Scoop rows keep values.
ALTER TABLE launches
  ALTER COLUMN fee_distributor_address DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN liquidity_locker_address DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN pool_id DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN lp_token_id DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN opening_sqrt_price_x96 DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN opening_tick DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN tick_lower DROP NOT NULL;

ALTER TABLE launches
  ALTER COLUMN tick_upper DROP NOT NULL;

-- Partial uniques so multiple NULLs (Pons pre-grad) are allowed.
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_pool_id_key;
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_chain_id_pool_id_key;
DROP INDEX IF EXISTS launches_pool_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS launches_pool_id_unique
  ON launches (chain_id, pool_id)
  WHERE pool_id IS NOT NULL;

ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_fee_distributor_address_key;
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_chain_id_fee_distributor_address_key;
DROP INDEX IF EXISTS launches_fee_distributor_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS launches_fee_distributor_unique
  ON launches (chain_id, fee_distributor_address)
  WHERE fee_distributor_address IS NOT NULL;

ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_liquidity_locker_address_key;
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_chain_id_liquidity_locker_address_key;
DROP INDEX IF EXISTS launches_liquidity_locker_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS launches_liquidity_locker_unique
  ON launches (chain_id, liquidity_locker_address)
  WHERE liquidity_locker_address IS NOT NULL;

ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_lp_token_id_key;
ALTER TABLE launches DROP CONSTRAINT IF EXISTS launches_chain_id_lp_token_id_key;
DROP INDEX IF EXISTS launches_lp_token_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS launches_lp_token_id_unique
  ON launches (chain_id, lp_token_id)
  WHERE lp_token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS launches_market_source_idx
  ON launches (chain_id, market_source);

CREATE INDEX IF NOT EXISTS launches_curve_address_idx
  ON launches (chain_id, curve_address)
  WHERE curve_address IS NOT NULL;

-- Safe backfill: all existing historical rows are Scoop.
UPDATE launches
SET market_source = 'scoop'
WHERE market_source IS NULL OR market_source = '';

COMMIT;
