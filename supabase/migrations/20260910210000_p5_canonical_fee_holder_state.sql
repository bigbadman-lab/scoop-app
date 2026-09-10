-- P5: canonical launch fee economics + holder reward state
-- Forward-safe; does not wipe production data.
-- Amounts remain NUMERIC(78,0) for uint256 safety.
-- Enum destinations stored as SMALLINT ordinals matching ScoopFeeTypes.sol.

-- ─── launches: immutable per-launch fee economics ───────────────────────────

ALTER TABLE launches
  ADD COLUMN IF NOT EXISTS additional_fee INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pool_fee INT NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS creator_allocation_destination SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_fee_destination SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holder_rewards_address CHAR(42);

-- Historical canaries: keep BASE_FEE (10000) + zero extra when unset.
UPDATE launches
SET
  additional_fee = COALESCE(additional_fee, 0),
  total_pool_fee = COALESCE(total_pool_fee, 10000),
  creator_allocation_destination = COALESCE(creator_allocation_destination, 0),
  additional_fee_destination = COALESCE(additional_fee_destination, 0)
WHERE TRUE;

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_additional_fee_check;
ALTER TABLE launches
  ADD CONSTRAINT launches_additional_fee_check
  CHECK (
    additional_fee >= 0
    AND additional_fee <= 20000
    AND additional_fee % 1000 = 0
  );

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_total_pool_fee_check;
ALTER TABLE launches
  ADD CONSTRAINT launches_total_pool_fee_check
  CHECK (
    total_pool_fee >= 10000
    AND total_pool_fee <= 30000
    AND total_pool_fee = 10000 + additional_fee
  );

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_creator_allocation_destination_check;
ALTER TABLE launches
  ADD CONSTRAINT launches_creator_allocation_destination_check
  CHECK (creator_allocation_destination IN (0, 1));

ALTER TABLE launches
  DROP CONSTRAINT IF EXISTS launches_additional_fee_destination_check;
ALTER TABLE launches
  ADD CONSTRAINT launches_additional_fee_destination_check
  CHECK (additional_fee_destination IN (0, 1, 2));

CREATE UNIQUE INDEX IF NOT EXISTS launches_holder_rewards_address_uidx
  ON launches (chain_id, holder_rewards_address)
  WHERE holder_rewards_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS launches_total_pool_fee_idx
  ON launches (chain_id, total_pool_fee);

-- ─── fee_distributions: base vs extra legs ──────────────────────────────────
-- Aggregate compatibility:
--   creator_raw    = base_creator_raw + extra_creator_raw
--   deployer_raw   = base_deployer_raw + extra_deployer_raw
--   buyback_raw    = base_protocol_raw   (protocol buyback / "base protocol")
--   operations_raw = base_operations_raw
--   holders_raw    = base_holders_raw + extra_holders_raw

ALTER TABLE fee_distributions
  ADD COLUMN IF NOT EXISTS base_creator_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_holders_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_deployer_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_protocol_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_operations_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_creator_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_deployer_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_holders_raw NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holders_raw NUMERIC(78,0) NOT NULL DEFAULT 0;

-- Backfill historical canary rows (pre-P3 event shape → all base, zero extra/holders).
UPDATE fee_distributions
SET
  base_creator_raw = creator_raw,
  base_deployer_raw = deployer_raw,
  base_protocol_raw = buyback_raw,
  base_operations_raw = operations_raw,
  base_holders_raw = 0,
  extra_creator_raw = 0,
  extra_deployer_raw = 0,
  extra_holders_raw = 0,
  holders_raw = 0
WHERE
  base_creator_raw = 0
  AND base_deployer_raw = 0
  AND base_protocol_raw = 0
  AND base_operations_raw = 0
  AND holders_raw = 0
  AND (creator_raw > 0 OR deployer_raw > 0 OR buyback_raw > 0 OR operations_raw > 0);

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_nonneg_legs_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_nonneg_legs_check
  CHECK (
    base_creator_raw >= 0
    AND base_holders_raw >= 0
    AND base_deployer_raw >= 0
    AND base_protocol_raw >= 0
    AND base_operations_raw >= 0
    AND extra_creator_raw >= 0
    AND extra_deployer_raw >= 0
    AND extra_holders_raw >= 0
    AND holders_raw >= 0
    AND total_raw >= 0
    AND creator_raw >= 0
    AND deployer_raw >= 0
    AND buyback_raw >= 0
    AND operations_raw >= 0
  );

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_conservation_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_conservation_check
  CHECK (
    base_creator_raw
      + base_holders_raw
      + base_deployer_raw
      + base_protocol_raw
      + base_operations_raw
      + extra_creator_raw
      + extra_deployer_raw
      + extra_holders_raw
    = total_raw
  );

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_aggregate_creator_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_aggregate_creator_check
  CHECK (creator_raw = base_creator_raw + extra_creator_raw);

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_aggregate_deployer_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_aggregate_deployer_check
  CHECK (deployer_raw = base_deployer_raw + extra_deployer_raw);

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_aggregate_holders_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_aggregate_holders_check
  CHECK (holders_raw = base_holders_raw + extra_holders_raw);

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_aggregate_buyback_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_aggregate_buyback_check
  CHECK (buyback_raw = base_protocol_raw);

ALTER TABLE fee_distributions
  DROP CONSTRAINT IF EXISTS fee_distributions_aggregate_operations_check;
ALTER TABLE fee_distributions
  ADD CONSTRAINT fee_distributions_aggregate_operations_check
  CHECK (operations_raw = base_operations_raw);

CREATE INDEX IF NOT EXISTS fee_distributions_token_asset_idx
  ON fee_distributions (chain_id, scooptoken_address, asset_kind, asset_address);

-- ─── holder_reward_deposits ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holder_reward_deposits (
  chain_id BIGINT NOT NULL REFERENCES chains (chain_id),
  vault_address CHAR(42) NOT NULL,
  token_address CHAR(42) NOT NULL,
  fee_distributor_address CHAR(42),
  asset_address CHAR(42) NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL CHECK (amount_raw >= 0),
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS holder_reward_deposits_vault_asset_idx
  ON holder_reward_deposits (chain_id, vault_address, asset_address, block_number);

CREATE INDEX IF NOT EXISTS holder_reward_deposits_token_idx
  ON holder_reward_deposits (chain_id, token_address, block_number);

-- ─── holder_reward_rounds ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holder_reward_rounds (
  chain_id BIGINT NOT NULL REFERENCES chains (chain_id),
  vault_address CHAR(42) NOT NULL,
  round_id BIGINT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  merkle_root CHAR(66) NOT NULL,
  total_committed_raw NUMERIC(78,0) NOT NULL CHECK (total_committed_raw >= 0),
  total_paid_raw NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (total_paid_raw >= 0),
  remaining_raw NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (remaining_raw >= 0),
  push_success_count INT NOT NULL DEFAULT 0 CHECK (push_success_count >= 0),
  push_failure_count INT NOT NULL DEFAULT 0 CHECK (push_failure_count >= 0),
  claim_count INT NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  published_tx_hash CHAR(66) NOT NULL,
  published_block_number BIGINT NOT NULL,
  published_log_index INT NOT NULL,
  published_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'settling', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, vault_address, round_id, asset_address),
  CONSTRAINT holder_reward_rounds_paid_lte_committed_check
    CHECK (total_paid_raw <= total_committed_raw),
  CONSTRAINT holder_reward_rounds_remaining_check
    CHECK (remaining_raw = total_committed_raw - total_paid_raw)
);

CREATE UNIQUE INDEX IF NOT EXISTS holder_reward_rounds_publish_event_uidx
  ON holder_reward_rounds (chain_id, published_tx_hash, published_log_index);

CREATE INDEX IF NOT EXISTS holder_reward_rounds_vault_status_idx
  ON holder_reward_rounds (chain_id, vault_address, status);

-- ─── holder_reward_payouts (push / claim / push-failed) ──────────────────────

CREATE TABLE IF NOT EXISTS holder_reward_payouts (
  chain_id BIGINT NOT NULL REFERENCES chains (chain_id),
  vault_address CHAR(42) NOT NULL,
  round_id BIGINT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  account_address CHAR(42) NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL CHECK (amount_raw >= 0),
  payout_type TEXT NOT NULL CHECK (payout_type IN ('push', 'claim')),
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed')),
  failure_reason TEXT,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index),
  CONSTRAINT holder_reward_payouts_failed_reason_check
    CHECK (
      (status = 'failed' AND payout_type = 'push')
      OR (status = 'paid' AND failure_reason IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS holder_reward_payouts_round_account_idx
  ON holder_reward_payouts (chain_id, vault_address, round_id, asset_address, account_address);

CREATE INDEX IF NOT EXISTS holder_reward_payouts_status_idx
  ON holder_reward_payouts (chain_id, vault_address, status, block_number);

-- Paid entitlements must be unique per round/asset/account (protocol isPaid).
CREATE UNIQUE INDEX IF NOT EXISTS holder_reward_payouts_paid_entitlement_uidx
  ON holder_reward_payouts (chain_id, vault_address, round_id, asset_address, account_address)
  WHERE status = 'paid';

-- ─── holder_balances: query aids for positive balances at latest state ───────

CREATE INDEX IF NOT EXISTS holder_balances_positive_token_idx
  ON holder_balances (chain_id, token_address, balance_raw DESC)
  WHERE balance_raw > 0;

CREATE INDEX IF NOT EXISTS holder_balances_positive_retail_idx
  ON holder_balances (chain_id, token_address, holder_address)
  WHERE balance_raw > 0 AND is_system_address = FALSE;

-- ─── address classification support for holder vaults ───────────────────────
-- class 'holder_rewards' is written by the indexer for each launch vault.
-- No seed rows: vaults are per-launch CREATE2 clones.
