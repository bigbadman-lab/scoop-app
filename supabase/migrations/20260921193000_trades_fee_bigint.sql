-- trades.fee stores UV4 fee tiers (small) and Pons curve fees (wei).
-- Wei-sized values overflow PostgreSQL integer; widen to bigint non-destructively.
BEGIN;

ALTER TABLE trades
  ALTER COLUMN fee TYPE bigint
  USING fee::bigint;

COMMIT;
