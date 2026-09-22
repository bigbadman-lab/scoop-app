-- External Pump import canary registry (operator-gated, mint-scoped cleanup).
-- Marks mints imported via the reusable external-Pump import path for safe removal.
--
-- Rollback: DROP TABLE IF EXISTS external_pump_import_canaries;

BEGIN;

CREATE TABLE IF NOT EXISTS external_pump_import_canaries (
  chain_id          BIGINT NOT NULL,
  mint              TEXT NOT NULL,
  import_kind       TEXT NOT NULL DEFAULT 'canary',
  launch_signature  TEXT NOT NULL,
  support_wallet    TEXT NULL,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT NULL,
  CONSTRAINT external_pump_import_canaries_pkey PRIMARY KEY (chain_id, mint),
  CONSTRAINT external_pump_import_canaries_chain_id_chk CHECK (chain_id = 900001),
  CONSTRAINT external_pump_import_canaries_kind_chk CHECK (import_kind IN ('canary', 'official'))
);

CREATE INDEX IF NOT EXISTS external_pump_import_canaries_kind_idx
  ON external_pump_import_canaries (chain_id, import_kind, imported_at DESC);

COMMIT;
