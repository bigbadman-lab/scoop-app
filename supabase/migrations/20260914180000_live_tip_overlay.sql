-- Transient near-tip live overlay (presentation only).
-- Never write these values into canonical tokens/trades/token_market_state.
-- TTL clears stale unconfirmed rows; confirmed indexer is source of truth.

BEGIN;

CREATE TABLE IF NOT EXISTS live_chain_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash CHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  tx_hash CHAR(66) NOT NULL,
  log_index INT NOT NULL,
  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('TokenLaunched', 'InitialBuyExecuted', 'Swap')),
  token_address CHAR(42),
  pool_id CHAR(66),
  quote_asset CHAR(42),
  side TEXT CHECK (side IS NULL OR side IN ('buy', 'sell')),
  quote_amount_raw NUMERIC(78, 0),
  token_amount_raw NUMERIC(78, 0),
  execution_price_quote_x18 NUMERIC(78, 0),
  execution_price_usd_x18 NUMERIC(78, 0),
  usd_value_x18 NUMERIC(78, 0),
  sqrt_price_x96 NUMERIC(78, 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS live_chain_events_token_time_idx
  ON live_chain_events (chain_id, token_address, block_timestamp DESC, log_index DESC)
  WHERE token_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_chain_events_expires_idx
  ON live_chain_events (expires_at);

CREATE INDEX IF NOT EXISTS live_chain_events_kind_idx
  ON live_chain_events (chain_id, event_kind, block_number DESC);

CREATE TABLE IF NOT EXISTS live_token_tips (
  chain_id BIGINT NOT NULL,
  token_address CHAR(42) NOT NULL,
  name TEXT,
  symbol TEXT,
  decimals INT,
  image_uri TEXT,
  display_image_url TEXT,
  pool_id CHAR(66),
  quote_asset CHAR(42),
  creator_id CHAR(66),
  deployer_address CHAR(42),
  factory_address CHAR(42),
  launched_at BIGINT,
  launch_tx_hash CHAR(66),
  price_quote_x18 NUMERIC(78, 0),
  price_usd_x18 NUMERIC(78, 0),
  fdv_usd_x18 NUMERIC(78, 0),
  volume_24h_quote_raw NUMERIC(78, 0),
  volume_24h_usd_x18 NUMERIC(78, 0),
  trade_count_delta INT NOT NULL DEFAULT 0,
  buy_count_delta INT NOT NULL DEFAULT 0,
  sell_count_delta INT NOT NULL DEFAULT 0,
  last_side TEXT CHECK (last_side IS NULL OR last_side IN ('buy', 'sell')),
  last_trade_at BIGINT,
  source_block BIGINT NOT NULL,
  source_tx_hash CHAR(66) NOT NULL,
  source_log_index INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  PRIMARY KEY (chain_id, token_address)
);

CREATE INDEX IF NOT EXISTS live_token_tips_expires_idx
  ON live_token_tips (expires_at);

CREATE INDEX IF NOT EXISTS live_token_tips_launched_idx
  ON live_token_tips (chain_id, launched_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS live_observer_checkpoints (
  chain_id BIGINT PRIMARY KEY,
  last_block_number BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE live_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_token_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_observer_checkpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON live_chain_events FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON live_token_tips FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON live_observer_checkpoints FROM anon, authenticated, PUBLIC;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
