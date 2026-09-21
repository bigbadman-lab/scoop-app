-- Pump market state: Solana holder count (Alchemy getTokenAccounts aggregation).
-- Additive only — does not alter price/volume/trade fields.

BEGIN;

ALTER TABLE pump_market_state
  ADD COLUMN IF NOT EXISTS holder_count BIGINT NULL,
  ADD COLUMN IF NOT EXISTS holders_updated_at TIMESTAMPTZ NULL;

COMMIT;
