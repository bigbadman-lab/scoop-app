import type { Queryable } from '../types.js';
import { toNumericString } from '../hex.js';

export interface IndexerHealthRow {
  chainId: number;
  heartbeatAt?: Date | string;
  latestIndexedBlock?: number | bigint | null;
  chainLatest?: number | bigint | null;
  chainSafe?: number | bigint | null;
  lagBlocks?: number | bigint | null;
  lastRpcOkAt?: Date | string | null;
  rpcErrorRate?: string | number | null;
  reorgCount?: number | bigint;
  dirtyProjections?: boolean;
  watchlistSize?: number;
  lastQuoteUsdAt?: Date | string | null;
  candleLagSeconds?: number | null;
  notes?: string | null;
}

export async function upsertIndexerHealth(db: Queryable, row: IndexerHealthRow): Promise<void> {
  await db.query(
    `INSERT INTO indexer_health (
      chain_id, heartbeat_at, latest_indexed_block, chain_latest, chain_safe, lag_blocks,
      last_rpc_ok_at, rpc_error_rate, reorg_count, dirty_projections, watchlist_size,
      last_quote_usd_at, candle_lag_seconds, notes
    ) VALUES (
      $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, $7, $8, COALESCE($9, 0),
      COALESCE($10, FALSE), COALESCE($11, 0), $12, $13, $14
    )
    ON CONFLICT (chain_id) DO UPDATE SET
      heartbeat_at = COALESCE(EXCLUDED.heartbeat_at, NOW()),
      latest_indexed_block = COALESCE(EXCLUDED.latest_indexed_block, indexer_health.latest_indexed_block),
      chain_latest = COALESCE(EXCLUDED.chain_latest, indexer_health.chain_latest),
      chain_safe = COALESCE(EXCLUDED.chain_safe, indexer_health.chain_safe),
      lag_blocks = COALESCE(EXCLUDED.lag_blocks, indexer_health.lag_blocks),
      last_rpc_ok_at = COALESCE(EXCLUDED.last_rpc_ok_at, indexer_health.last_rpc_ok_at),
      rpc_error_rate = COALESCE(EXCLUDED.rpc_error_rate, indexer_health.rpc_error_rate),
      reorg_count = COALESCE(EXCLUDED.reorg_count, indexer_health.reorg_count),
      dirty_projections = COALESCE(EXCLUDED.dirty_projections, indexer_health.dirty_projections),
      watchlist_size = COALESCE(EXCLUDED.watchlist_size, indexer_health.watchlist_size),
      last_quote_usd_at = COALESCE(EXCLUDED.last_quote_usd_at, indexer_health.last_quote_usd_at),
      candle_lag_seconds = COALESCE(EXCLUDED.candle_lag_seconds, indexer_health.candle_lag_seconds),
      notes = COALESCE(EXCLUDED.notes, indexer_health.notes),
      updated_at = NOW()`,
    [
      row.chainId,
      row.heartbeatAt ?? null,
      row.latestIndexedBlock == null ? null : toNumericString(row.latestIndexedBlock),
      row.chainLatest == null ? null : toNumericString(row.chainLatest),
      row.chainSafe == null ? null : toNumericString(row.chainSafe),
      row.lagBlocks == null ? null : toNumericString(row.lagBlocks),
      row.lastRpcOkAt ?? null,
      row.rpcErrorRate ?? null,
      row.reorgCount == null ? null : toNumericString(row.reorgCount),
      row.dirtyProjections ?? null,
      row.watchlistSize ?? null,
      row.lastQuoteUsdAt ?? null,
      row.candleLagSeconds ?? null,
      row.notes ?? null,
    ],
  );
}
