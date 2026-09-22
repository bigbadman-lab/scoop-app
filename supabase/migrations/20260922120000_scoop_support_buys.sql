-- SCOOP support-wallet buy tracking (Pump / Solana).
-- Tracks confirmed buys by the public SCOOP ecosystem wallet only.
--
-- Rollback:
--   DROP TABLE IF EXISTS scoop_support_buys;

BEGIN;

CREATE TABLE IF NOT EXISTS scoop_support_buys (
  chain_id            BIGINT NOT NULL,
  mint                TEXT NOT NULL,
  signature           TEXT NOT NULL,
  event_index         INTEGER NOT NULL,
  slot                BIGINT NOT NULL,
  block_time          TIMESTAMPTZ NOT NULL,
  support_wallet      TEXT NOT NULL,
  sol_amount_lamports BIGINT NOT NULL,
  sol_amount          NUMERIC NOT NULL,
  token_amount_raw    NUMERIC NOT NULL,
  token_amount        NUMERIC NOT NULL,
  token_decimals      INTEGER NOT NULL,
  source              TEXT NOT NULL DEFAULT 'alchemy',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scoop_support_buys_pkey PRIMARY KEY (chain_id, signature, event_index),
  CONSTRAINT scoop_support_buys_chain_id_chk CHECK (chain_id = 900001),
  CONSTRAINT scoop_support_buys_source_chk CHECK (source IN ('pump', 'pumpportal', 'alchemy', 'backfill')),
  CONSTRAINT scoop_support_buys_sol_positive_chk CHECK (sol_amount_lamports > 0),
  CONSTRAINT scoop_support_buys_token_positive_chk CHECK (token_amount_raw > 0)
);

CREATE INDEX IF NOT EXISTS scoop_support_buys_mint_time_idx
  ON scoop_support_buys (chain_id, mint, block_time DESC);

CREATE INDEX IF NOT EXISTS scoop_support_buys_wallet_time_idx
  ON scoop_support_buys (chain_id, support_wallet, block_time DESC);

COMMIT;
