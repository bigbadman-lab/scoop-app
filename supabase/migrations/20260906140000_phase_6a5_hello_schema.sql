-- Phase 6A.5 — HELLO vertical slice schema (MVP subset of 6A.2 + 6A.3 health/snapshots)
-- Idempotent seeds for Robinhood Chain 4663 / scoop-v1-mainnet-canary
-- No auth schema changes. No destructive unrelated DROPs.

BEGIN;

CREATE TABLE IF NOT EXISTS chains (
  chain_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  native_symbol TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protocol_contracts (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  role TEXT NOT NULL,
  address CHAR(42) NOT NULL,
  deployment_tx_hash CHAR(66),
  deployment_block BIGINT,
  active_from_block BIGINT,
  active_to_block BIGINT,
  version TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, role, address)
);

CREATE TABLE IF NOT EXISTS quote_assets (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  quote_asset CHAR(42) NOT NULL,
  quote_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals SMALLINT NOT NULL,
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  oracle_feed CHAR(42),
  oracle_max_age INT,
  oracle_feed_decimals SMALLINT,
  updated_block BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, quote_asset)
);

CREATE TABLE IF NOT EXISTS address_classifications (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  address CHAR(42) NOT NULL,
  class TEXT NOT NULL,
  label TEXT NOT NULL,
  related_token TEXT NOT NULL DEFAULT '',
  related_pool TEXT,
  active_from_block BIGINT,
  active_to_block BIGINT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, address, class, related_token)
);

CREATE TABLE IF NOT EXISTS raw_chain_events (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  tx_index INT NOT NULL,
  log_index INT NOT NULL,
  contract_address CHAR(42) NOT NULL,
  topic0 CHAR(66) NOT NULL,
  topics JSONB NOT NULL,
  data TEXT NOT NULL,
  decoded_event_name TEXT,
  decoded_payload JSONB,
  confirmation_status TEXT NOT NULL DEFAULT 'confirmed',
  is_canonical BOOLEAN NOT NULL DEFAULT TRUE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS raw_chain_events_block_idx
  ON raw_chain_events (chain_id, block_number, log_index);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  stream_name TEXT NOT NULL,
  last_block_number BIGINT NOT NULL,
  last_block_hash CHAR(66) NOT NULL,
  last_log_index INT NOT NULL DEFAULT -1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, stream_name)
);

CREATE TABLE IF NOT EXISTS creators (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  creator_id CHAR(66) NOT NULL,
  creator_type TEXT NOT NULL,
  wallet_address CHAR(42),
  x_user_id NUMERIC(78,0),
  resolved_payout_wallet CHAR(42),
  is_x_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_block BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, creator_id)
);

CREATE TABLE IF NOT EXISTS tokens (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals SMALLINT NOT NULL,
  total_supply_raw NUMERIC(78,0) NOT NULL,
  image_uri TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  twitter TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  discord TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  farcaster TEXT NOT NULL DEFAULT '',
  deployer_address CHAR(42) NOT NULL,
  launch_factory_address CHAR(42) NOT NULL,
  contract_uri TEXT,
  metadata_source_block BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, token_address)
);

CREATE TABLE IF NOT EXISTS launches (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  factory_address CHAR(42) NOT NULL,
  deployer_address CHAR(42) NOT NULL,
  creator_id CHAR(66) NOT NULL,
  quote_asset CHAR(42) NOT NULL,
  fee_distributor_address CHAR(42) NOT NULL,
  liquidity_locker_address CHAR(42) NOT NULL,
  pool_id CHAR(66) NOT NULL,
  lp_token_id NUMERIC(78,0) NOT NULL,
  opening_sqrt_price_x96 NUMERIC(78,0) NOT NULL,
  opening_tick INT NOT NULL,
  tick_lower INT NOT NULL,
  tick_upper INT NOT NULL,
  launch_tx_hash CHAR(66) NOT NULL,
  launch_block BIGINT NOT NULL,
  launch_log_index INT NOT NULL,
  launched_at BIGINT NOT NULL,
  launch_fee_raw NUMERIC(78,0) NOT NULL,
  initial_buy_present BOOLEAN NOT NULL DEFAULT FALSE,
  initial_buy_quote_raw NUMERIC(78,0),
  initial_buy_tokens_raw NUMERIC(78,0),
  metadata_hydrated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, token_address),
  UNIQUE (chain_id, pool_id),
  UNIQUE (chain_id, fee_distributor_address),
  UNIQUE (chain_id, liquidity_locker_address),
  UNIQUE (chain_id, lp_token_id)
);

CREATE INDEX IF NOT EXISTS launches_launched_at_idx
  ON launches (chain_id, launched_at DESC);
CREATE INDEX IF NOT EXISTS launches_creator_idx
  ON launches (chain_id, creator_id);

CREATE TABLE IF NOT EXISTS pools (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  pool_id CHAR(66) NOT NULL,
  token_address CHAR(42) NOT NULL,
  quote_asset CHAR(42) NOT NULL,
  currency0 CHAR(42) NOT NULL,
  currency1 CHAR(42) NOT NULL,
  fee INT NOT NULL,
  tick_spacing INT NOT NULL,
  hooks CHAR(42) NOT NULL,
  lp_token_id NUMERIC(78,0) NOT NULL,
  liquidity_locker_address CHAR(42) NOT NULL,
  initialized_tx_hash CHAR(66) NOT NULL,
  initialized_block BIGINT NOT NULL,
  initialized_at BIGINT NOT NULL,
  opening_sqrt_price_x96 NUMERIC(78,0) NOT NULL,
  opening_tick INT NOT NULL,
  current_sqrt_price_x96 NUMERIC(78,0),
  current_tick INT,
  current_liquidity_raw NUMERIC(78,0),
  last_swap_block BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, pool_id)
);

CREATE TABLE IF NOT EXISTS trades (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  pool_id CHAR(66) NOT NULL,
  token_address CHAR(42) NOT NULL,
  quote_asset CHAR(42) NOT NULL,
  swap_sender CHAR(42) NOT NULL,
  tx_from CHAR(42),
  trader_address CHAR(42),
  trader_attribution_type TEXT NOT NULL,
  side TEXT NOT NULL,
  amount0_raw NUMERIC(78,0) NOT NULL,
  amount1_raw NUMERIC(78,0) NOT NULL,
  quote_amount_raw NUMERIC(78,0) NOT NULL,
  token_amount_raw NUMERIC(78,0) NOT NULL,
  sqrt_price_x96_after NUMERIC(78,0) NOT NULL,
  tick_after INT NOT NULL,
  liquidity_after_raw NUMERIC(78,0) NOT NULL,
  fee INT NOT NULL,
  execution_price_quote_x18 NUMERIC(78,0) NOT NULL,
  quote_usd_x18 NUMERIC(78,0),
  execution_price_usd_x18 NUMERIC(78,0),
  usd_value_x18 NUMERIC(78,0),
  is_initial_buy BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS trades_pool_ts_idx
  ON trades (chain_id, pool_id, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS trades_token_ts_idx
  ON trades (chain_id, token_address, block_timestamp DESC);

CREATE TABLE IF NOT EXISTS transfers (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  from_address CHAR(42) NOT NULL,
  to_address CHAR(42) NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL,
  transfer_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS transfers_token_block_idx
  ON transfers (chain_id, token_address, block_number, log_index);

CREATE TABLE IF NOT EXISTS holder_balances (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  holder_address CHAR(42) NOT NULL,
  balance_raw NUMERIC(78,0) NOT NULL,
  holder_class TEXT NOT NULL DEFAULT 'user',
  is_system_address BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_block BIGINT NOT NULL,
  last_updated_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, token_address, holder_address)
);

CREATE INDEX IF NOT EXISTS holder_balances_rank_idx
  ON holder_balances (chain_id, token_address, balance_raw DESC);

CREATE TABLE IF NOT EXISTS token_market_state (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  pool_id CHAR(66) NOT NULL,
  sqrt_price_x96 NUMERIC(78,0) NOT NULL,
  tick INT NOT NULL,
  price_quote_x18 NUMERIC(78,0) NOT NULL,
  quote_usd_x18 NUMERIC(78,0),
  price_usd_x18 NUMERIC(78,0),
  fdv_usd_x18 NUMERIC(78,0),
  liquidity_raw NUMERIC(78,0) NOT NULL,
  source_block BIGINT NOT NULL,
  source_tx_hash CHAR(66),
  source_log_index INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, token_address)
);

CREATE TABLE IF NOT EXISTS candles (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  token_address CHAR(42) NOT NULL,
  pool_id CHAR(66) NOT NULL,
  interval TEXT NOT NULL,
  bucket_start BIGINT NOT NULL,
  open_quote_x18 NUMERIC(78,0) NOT NULL,
  high_quote_x18 NUMERIC(78,0) NOT NULL,
  low_quote_x18 NUMERIC(78,0) NOT NULL,
  close_quote_x18 NUMERIC(78,0) NOT NULL,
  quote_volume_raw NUMERIC(78,0) NOT NULL,
  token_volume_raw NUMERIC(78,0) NOT NULL,
  trade_count INT NOT NULL,
  buy_count INT NOT NULL,
  sell_count INT NOT NULL,
  open_usd_x18 NUMERIC(78,0),
  high_usd_x18 NUMERIC(78,0),
  low_usd_x18 NUMERIC(78,0),
  close_usd_x18 NUMERIC(78,0),
  usd_volume_x18 NUMERIC(78,0),
  first_trade_block BIGINT,
  last_trade_block BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, pool_id, interval, bucket_start)
);

CREATE TABLE IF NOT EXISTS fee_distributions (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  fee_distributor_address CHAR(42) NOT NULL,
  scooptoken_address CHAR(42) NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  total_raw NUMERIC(78,0) NOT NULL,
  creator_raw NUMERIC(78,0) NOT NULL,
  deployer_raw NUMERIC(78,0) NOT NULL,
  buyback_raw NUMERIC(78,0) NOT NULL,
  operations_raw NUMERIC(78,0) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS creator_credits (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  creator_id CHAR(66) NOT NULL,
  source_address CHAR(42) NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS creator_claims (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  creator_id CHAR(66) NOT NULL,
  payout_wallet CHAR(42) NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS creator_claimable_state (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  creator_id CHAR(66) NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_address CHAR(42) NOT NULL,
  claimable_raw NUMERIC(78,0) NOT NULL,
  source_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, creator_id, asset_kind, asset_address)
);

CREATE TABLE IF NOT EXISTS quote_price_snapshots (
  chain_id BIGINT NOT NULL REFERENCES chains(chain_id),
  quote_asset CHAR(42) NOT NULL,
  price_usd_x18 NUMERIC(78,0) NOT NULL,
  source_block BIGINT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, quote_asset, observed_at)
);

CREATE TABLE IF NOT EXISTS indexer_health (
  chain_id BIGINT PRIMARY KEY REFERENCES chains(chain_id),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latest_indexed_block BIGINT,
  chain_latest BIGINT,
  chain_safe BIGINT,
  lag_blocks BIGINT,
  last_rpc_ok_at TIMESTAMPTZ,
  rpc_error_rate NUMERIC(18,8),
  reorg_count BIGINT NOT NULL DEFAULT 0,
  dirty_projections BOOLEAN NOT NULL DEFAULT FALSE,
  watchlist_size INT NOT NULL DEFAULT 0,
  last_quote_usd_at TIMESTAMPTZ,
  candle_lag_seconds INT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeds (idempotent)
INSERT INTO chains (chain_id, name, native_symbol, is_active)
VALUES (4663, 'Robinhood Chain', 'ETH', TRUE)
ON CONFLICT (chain_id) DO UPDATE
SET name = EXCLUDED.name,
    native_symbol = EXCLUDED.native_symbol,
    is_active = EXCLUDED.is_active;

INSERT INTO protocol_contracts (chain_id, role, address, version)
VALUES
  (4663, 'ScoopFactory', '0x15e874bc667435ddbf2a67c0362701dc23c90833', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopCreatorRewards', '0x1248070fc454757b91337e66df883f90b7a06fa4', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopCreatorRegistry', '0x608e117eda28b65cda473756a990b8246eae62d2', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopQuoteRegistry', '0x7e34424d65e5042ac82cd036fa63f3e841349ecd', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopPriceOracle', '0xc818e890ae8dbe0ccd1bf9169adb19d578867f12', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopTokenDeployer', '0xb50307bc184e000281e3b1ee59fa0a099ecd0444', 'scoop-v1-mainnet-canary'),
  (4663, 'ScoopLaunchDeployer', '0xc36470c674defc2d65ee179b686581954a5b16b0', 'scoop-v1-mainnet-canary'),
  (4663, 'PoolManager', '0x8366a39cc670b4001a1121b8f6a443a643e40951', 'scoop-v1-mainnet-canary'),
  (4663, 'PositionManager', '0x58daec3116aae6d93017baaea7749052e8a04fa7', 'scoop-v1-mainnet-canary'),
  (4663, 'UniversalRouter', '0x8876789976decbfcbbbe364623c63652db8c0904', 'scoop-v1-mainnet-canary'),
  (4663, 'Permit2', '0x000000000022d473030f116ddee9f6b43ac78ba3', 'scoop-v1-mainnet-canary')
ON CONFLICT (chain_id, role, address) DO UPDATE
SET version = EXCLUDED.version;

INSERT INTO quote_assets (
  chain_id, quote_asset, quote_type, symbol, decimals,
  is_registered, is_enabled, oracle_feed, oracle_max_age, oracle_feed_decimals
) VALUES (
  4663,
  '0x0000000000000000000000000000000000000000',
  'native',
  'ETH',
  18,
  TRUE,
  TRUE,
  '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9',
  86400,
  8
)
ON CONFLICT (chain_id, quote_asset) DO UPDATE
SET quote_type = EXCLUDED.quote_type,
    symbol = EXCLUDED.symbol,
    decimals = EXCLUDED.decimals,
    is_registered = EXCLUDED.is_registered,
    is_enabled = EXCLUDED.is_enabled,
    oracle_feed = EXCLUDED.oracle_feed,
    oracle_max_age = EXCLUDED.oracle_max_age,
    oracle_feed_decimals = EXCLUDED.oracle_feed_decimals,
    updated_at = NOW();

INSERT INTO address_classifications (chain_id, address, class, label, related_token)
VALUES
  (4663, '0x8366a39cc670b4001a1121b8f6a443a643e40951', 'pool_manager', 'PoolManager', ''),
  (4663, '0x58daec3116aae6d93017baaea7749052e8a04fa7', 'position_manager', 'PositionManager', ''),
  (4663, '0x15e874bc667435ddbf2a67c0362701dc23c90833', 'factory', 'ScoopFactory', ''),
  (4663, '0x1248070fc454757b91337e66df883f90b7a06fa4', 'creator_rewards', 'ScoopCreatorRewards', ''),
  (4663, '0x8876789976decbfcbbbe364623c63652db8c0904', 'universal_router', 'UniversalRouter', ''),
  (4663, '0x000000000022d473030f116ddee9f6b43ac78ba3', 'permit2', 'Permit2', ''),
  (4663, '0xcb2d4ced82b5e9e013f4db58f999662052ae1fa3', 'treasury', 'LaunchFeeRecipient', ''),
  (4663, '0x000000000000000000000000000000000000dead', 'dead', 'DeadAddress', '')
ON CONFLICT (chain_id, address, class, related_token) DO UPDATE
SET label = EXCLUDED.label,
    updated_at = NOW();

INSERT INTO indexer_health (chain_id, notes)
VALUES (4663, 'Phase 6A.5 bootstrap — live indexing disabled')
ON CONFLICT (chain_id) DO NOTHING;

COMMIT;
