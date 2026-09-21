-- Allow Alchemy as a pump_trades.source for Solana market-data migration.
BEGIN;

ALTER TABLE pump_trades DROP CONSTRAINT IF EXISTS pump_trades_source_chk;
ALTER TABLE pump_trades
  ADD CONSTRAINT pump_trades_source_chk
  CHECK (source IN ('pump', 'pumpportal', 'alchemy'));

COMMIT;
