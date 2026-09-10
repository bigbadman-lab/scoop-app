-- P8 holder rewards worker: off-chain round computation + entitlements for Merkle publish/push.
-- Additive. Do not apply remotely in P8.

BEGIN;

CREATE TABLE IF NOT EXISTS holder_reward_worker_rounds (
  chain_id BIGINT NOT NULL,
  vault_address CHAR(42) NOT NULL,
  token_address CHAR(42) NOT NULL,
  round_id BIGINT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  snapshot_block BIGINT NOT NULL,
  hour_end_unix BIGINT NOT NULL,
  merkle_root CHAR(66),
  reward_amount_raw NUMERIC(78, 0) NOT NULL,
  eligible_supply_raw NUMERIC(78, 0),
  leaf_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  computed_at TIMESTAMPTZ,
  published_tx_hash CHAR(66),
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, vault_address, round_id, asset_address),
  CONSTRAINT holder_reward_worker_rounds_status_check CHECK (
    status IN (
      'pending',
      'snapshot_ready',
      'computed',
      'publish_ready',
      'published',
      'push_in_progress',
      'settled',
      'failed',
      'skipped_no_reward',
      'skipped_no_holders',
      'snapshot_not_ready'
    )
  ),
  CONSTRAINT holder_reward_worker_rounds_addrs_check CHECK (
    vault_address = lower(vault_address)
    AND token_address = lower(token_address)
    AND asset_address = lower(asset_address)
  ),
  CONSTRAINT holder_reward_worker_rounds_root_check CHECK (
    merkle_root IS NULL OR merkle_root = lower(merkle_root)
  )
);

CREATE INDEX IF NOT EXISTS holder_reward_worker_rounds_status_idx
  ON holder_reward_worker_rounds (chain_id, status, round_id);

CREATE TABLE IF NOT EXISTS holder_reward_entitlements (
  chain_id BIGINT NOT NULL,
  vault_address CHAR(42) NOT NULL,
  round_id BIGINT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  account_address CHAR(42) NOT NULL,
  snapshot_block BIGINT NOT NULL,
  balance_raw NUMERIC(78, 0) NOT NULL,
  eligible_supply_raw NUMERIC(78, 0) NOT NULL,
  reward_amount_raw NUMERIC(78, 0) NOT NULL,
  entitlement_raw NUMERIC(78, 0) NOT NULL,
  leaf_hash CHAR(66) NOT NULL,
  leaf_index INTEGER NOT NULL,
  proof_json JSONB NOT NULL,
  push_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, vault_address, round_id, asset_address, account_address),
  CONSTRAINT holder_reward_entitlements_push_status_check CHECK (
    push_status IN ('unpaid', 'paid', 'failed', 'skipped')
  ),
  CONSTRAINT holder_reward_entitlements_addrs_check CHECK (
    vault_address = lower(vault_address)
    AND asset_address = lower(asset_address)
    AND account_address = lower(account_address)
  ),
  CONSTRAINT holder_reward_entitlements_leaf_check CHECK (
    leaf_hash = lower(leaf_hash)
  ),
  CONSTRAINT holder_reward_entitlements_positive_check CHECK (
    entitlement_raw > 0 AND balance_raw > 0
  )
);

CREATE INDEX IF NOT EXISTS holder_reward_entitlements_unpaid_idx
  ON holder_reward_entitlements (chain_id, vault_address, round_id, asset_address, account_address)
  WHERE push_status = 'unpaid';

COMMIT;
