-- Solana / Pump market-data tables (Phase 5 MVP).
-- Isolated from EVM RHC trades/candles/token_market_state.
-- LOCAL MIGRATION ONLY — do not apply to production in this phase.
--
-- Rollback notes:
--   DROP TABLE IF EXISTS pump_worker_checkpoints;
--   DROP TABLE IF EXISTS pump_candles;
--   DROP TABLE IF EXISTS pump_trades;
--   DROP TABLE IF EXISTS pump_market_state;

BEGIN;

CREATE TABLE IF NOT EXISTS pump_trades (
  chain_id            BIGINT NOT NULL,
  mint                TEXT NOT NULL,
  signature           TEXT NOT NULL,
  event_index         INTEGER NOT NULL,
  slot                BIGINT NOT NULL,
  block_time          TIMESTAMPTZ NOT NULL,
  side                TEXT NOT NULL,
  wallet              TEXT NULL,
  token_amount_raw    NUMERIC NOT NULL,
  token_amount        NUMERIC NOT NULL,
  sol_amount_lamports BIGINT NOT NULL,
  sol_amount          NUMERIC NOT NULL,
  price_sol           NUMERIC NOT NULL,
  source              TEXT NOT NULL DEFAULT 'pump',
  curve_address       TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pump_trades_pkey PRIMARY KEY (chain_id, signature, event_index),
  CONSTRAINT pump_trades_chain_id_chk CHECK (chain_id = 900001),
  CONSTRAINT pump_trades_side_chk CHECK (side IN ('buy', 'sell')),
  CONSTRAINT pump_trades_source_chk CHECK (source IN ('pump', 'pumpportal'))
);

CREATE INDEX IF NOT EXISTS pump_trades_mint_time_idx
  ON pump_trades (chain_id, mint, block_time DESC);

CREATE INDEX IF NOT EXISTS pump_trades_mint_slot_idx
  ON pump_trades (chain_id, mint, slot DESC);

CREATE TABLE IF NOT EXISTS pump_candles (
  chain_id          BIGINT NOT NULL,
  mint              TEXT NOT NULL,
  interval          TEXT NOT NULL,
  bucket_start      TIMESTAMPTZ NOT NULL,
  open_price_sol    NUMERIC NOT NULL,
  high_price_sol    NUMERIC NOT NULL,
  low_price_sol     NUMERIC NOT NULL,
  close_price_sol   NUMERIC NOT NULL,
  volume_sol        NUMERIC NOT NULL DEFAULT 0,
  volume_tokens     NUMERIC NOT NULL DEFAULT 0,
  trade_count       INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pump_candles_pkey PRIMARY KEY (chain_id, mint, interval, bucket_start),
  CONSTRAINT pump_candles_chain_id_chk CHECK (chain_id = 900001),
  CONSTRAINT pump_candles_interval_chk CHECK (interval IN ('1m', '5m', '1h'))
);

CREATE INDEX IF NOT EXISTS pump_candles_mint_interval_bucket_idx
  ON pump_candles (chain_id, mint, interval, bucket_start DESC);

CREATE TABLE IF NOT EXISTS pump_market_state (
  chain_id               BIGINT NOT NULL,
  mint                   TEXT NOT NULL,
  price_sol              NUMERIC NULL,
  fdv_sol                NUMERIC NULL,
  volume_24h_sol         NUMERIC NOT NULL DEFAULT 0,
  trade_count_24h        INTEGER NOT NULL DEFAULT 0,
  buy_count_24h          INTEGER NOT NULL DEFAULT 0,
  sell_count_24h         INTEGER NOT NULL DEFAULT 0,
  last_trade_signature   TEXT NULL,
  last_trade_slot        BIGINT NULL,
  last_trade_at          TIMESTAMPTZ NULL,
  last_event_cursor      TEXT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pump_market_state_pkey PRIMARY KEY (chain_id, mint),
  CONSTRAINT pump_market_state_chain_id_chk CHECK (chain_id = 900001)
);

CREATE TABLE IF NOT EXISTS pump_worker_checkpoints (
  chain_id            BIGINT NOT NULL,
  mint                TEXT NOT NULL,
  last_signature      TEXT NULL,
  last_slot           BIGINT NULL,
  provider_cursor     TEXT NULL,
  last_event_at       TIMESTAMPTZ NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pump_worker_checkpoints_pkey PRIMARY KEY (chain_id, mint),
  CONSTRAINT pump_worker_checkpoints_chain_id_chk CHECK (chain_id = 900001)
);

COMMIT;
