/**
 * Per-mint Pump worker checkpoints — bounded resume only.
 */

import type { Queryable } from '../types.js';
import { PUMP_MARKET_CHAIN_ID } from './pump-trades.js';

export type PumpWorkerCheckpoint = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  lastSignature: string | null;
  lastSlot: string | null;
  providerCursor: string | null;
  lastEventAt: Date | null;
  updatedAt: Date | null;
};

export type UpsertPumpWorkerCheckpointInput = {
  mint: string;
  lastSignature?: string | null;
  lastSlot?: number | bigint | null;
  providerCursor?: string | null;
  lastEventAt?: Date | string | null;
};

function mapRow(row: Record<string, unknown>): PumpWorkerCheckpoint {
  return {
    chainId: PUMP_MARKET_CHAIN_ID,
    mint: String(row.mint),
    lastSignature: row.last_signature == null ? null : String(row.last_signature),
    lastSlot: row.last_slot == null ? null : String(row.last_slot),
    providerCursor: row.provider_cursor == null ? null : String(row.provider_cursor),
    lastEventAt: row.last_event_at == null ? null : new Date(String(row.last_event_at)),
    updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)),
  };
}

export async function getPumpWorkerCheckpoint(
  db: Queryable,
  mint: string,
): Promise<PumpWorkerCheckpoint | null> {
  const result = await db.query(
    `SELECT * FROM pump_worker_checkpoints WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, mint.trim()],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function upsertPumpWorkerCheckpoint(
  db: Queryable,
  input: UpsertPumpWorkerCheckpointInput,
): Promise<PumpWorkerCheckpoint> {
  const mint = input.mint.trim();
  const lastEventAt =
    input.lastEventAt == null
      ? null
      : input.lastEventAt instanceof Date
        ? input.lastEventAt.toISOString()
        : input.lastEventAt;

  await db.query(
    `INSERT INTO pump_worker_checkpoints (
      chain_id, mint, last_signature, last_slot, provider_cursor, last_event_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (chain_id, mint) DO UPDATE SET
      last_signature = COALESCE(EXCLUDED.last_signature, pump_worker_checkpoints.last_signature),
      last_slot = COALESCE(EXCLUDED.last_slot, pump_worker_checkpoints.last_slot),
      provider_cursor = COALESCE(EXCLUDED.provider_cursor, pump_worker_checkpoints.provider_cursor),
      last_event_at = COALESCE(EXCLUDED.last_event_at, pump_worker_checkpoints.last_event_at),
      updated_at = NOW()`,
    [
      PUMP_MARKET_CHAIN_ID,
      mint,
      input.lastSignature ?? null,
      input.lastSlot == null ? null : String(input.lastSlot),
      input.providerCursor ?? null,
      lastEventAt,
    ],
  );

  const row = await getPumpWorkerCheckpoint(db, mint);
  if (!row) {
    throw new Error(`Failed to upsert pump_worker_checkpoint for ${mint}`);
  }
  return row;
}
