import type { Queryable } from '../types.js';
import { toNumericString } from '../hex.js';

export interface IndexerHealthRow {
  chainId: number;
  heartbeatAt?: Date | string;
  latestIndexedBlock?: number | bigint | null;
  chainLatest?: number | bigint | null;
  chainSafe?: number | bigint | null;
  chainFinalized?: number | bigint | null;
  lagBlocks?: number | bigint | null;
  lastRpcOkAt?: Date | string | null;
  rpcErrorRate?: string | number | null;
  reorgCount?: number | bigint;
  dirtyProjections?: boolean;
  watchlistSize?: number;
  lastQuoteUsdAt?: Date | string | null;
  candleLagSeconds?: number | null;
  activeRpc?: string | null;
  wsConnected?: boolean;
  notes?: string | null;
}

export async function upsertIndexerHealth(db: Queryable, row: IndexerHealthRow): Promise<void> {
  await db.query(
    `INSERT INTO indexer_health (
      chain_id, heartbeat_at, latest_indexed_block, chain_latest, chain_safe, chain_finalized,
      lag_blocks, last_rpc_ok_at, rpc_error_rate, reorg_count, dirty_projections, watchlist_size,
      last_quote_usd_at, candle_lag_seconds, active_rpc, ws_connected, notes
    ) VALUES (
      $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, $7, $8, COALESCE($9, 0),
      COALESCE($10, 0), COALESCE($11, FALSE), COALESCE($12, 0), $13, $14, $15,
      COALESCE($16, FALSE), $17
    )
    ON CONFLICT (chain_id) DO UPDATE SET
      heartbeat_at = COALESCE(EXCLUDED.heartbeat_at, NOW()),
      latest_indexed_block = COALESCE(EXCLUDED.latest_indexed_block, indexer_health.latest_indexed_block),
      chain_latest = COALESCE(EXCLUDED.chain_latest, indexer_health.chain_latest),
      chain_safe = COALESCE(EXCLUDED.chain_safe, indexer_health.chain_safe),
      chain_finalized = COALESCE(EXCLUDED.chain_finalized, indexer_health.chain_finalized),
      lag_blocks = COALESCE(EXCLUDED.lag_blocks, indexer_health.lag_blocks),
      last_rpc_ok_at = COALESCE(EXCLUDED.last_rpc_ok_at, indexer_health.last_rpc_ok_at),
      rpc_error_rate = COALESCE(EXCLUDED.rpc_error_rate, indexer_health.rpc_error_rate),
      reorg_count = COALESCE(EXCLUDED.reorg_count, indexer_health.reorg_count),
      dirty_projections = COALESCE(EXCLUDED.dirty_projections, indexer_health.dirty_projections),
      watchlist_size = COALESCE(EXCLUDED.watchlist_size, indexer_health.watchlist_size),
      last_quote_usd_at = COALESCE(EXCLUDED.last_quote_usd_at, indexer_health.last_quote_usd_at),
      candle_lag_seconds = COALESCE(EXCLUDED.candle_lag_seconds, indexer_health.candle_lag_seconds),
      active_rpc = COALESCE(EXCLUDED.active_rpc, indexer_health.active_rpc),
      ws_connected = COALESCE(EXCLUDED.ws_connected, indexer_health.ws_connected),
      notes = COALESCE(EXCLUDED.notes, indexer_health.notes),
      updated_at = NOW()`,
    [
      row.chainId,
      row.heartbeatAt ?? null,
      row.latestIndexedBlock == null ? null : toNumericString(row.latestIndexedBlock),
      row.chainLatest == null ? null : toNumericString(row.chainLatest),
      row.chainSafe == null ? null : toNumericString(row.chainSafe),
      row.chainFinalized == null ? null : toNumericString(row.chainFinalized),
      row.lagBlocks == null ? null : toNumericString(row.lagBlocks),
      row.lastRpcOkAt ?? null,
      row.rpcErrorRate ?? null,
      row.reorgCount == null ? null : toNumericString(row.reorgCount),
      row.dirtyProjections ?? null,
      row.watchlistSize ?? null,
      row.lastQuoteUsdAt ?? null,
      row.candleLagSeconds ?? null,
      row.activeRpc ?? null,
      row.wsConnected ?? null,
      row.notes ?? null,
    ],
  );
}

export async function getIndexerHealth(
  db: Queryable,
  chainId: number,
): Promise<IndexerHealthRow | null> {
  const result = await db.query<{
    chain_id: string;
    heartbeat_at: Date;
    latest_indexed_block: string | null;
    chain_latest: string | null;
    chain_safe: string | null;
    chain_finalized: string | null;
    lag_blocks: string | null;
    last_rpc_ok_at: Date | null;
    rpc_error_rate: string | null;
    reorg_count: string;
    dirty_projections: boolean;
    watchlist_size: number;
    last_quote_usd_at: Date | null;
    candle_lag_seconds: number | null;
    active_rpc: string | null;
    ws_connected: boolean;
    notes: string | null;
  }>(`SELECT * FROM indexer_health WHERE chain_id = $1`, [chainId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    chainId: Number(row.chain_id),
    heartbeatAt: row.heartbeat_at,
    latestIndexedBlock:
      row.latest_indexed_block == null ? null : BigInt(row.latest_indexed_block),
    chainLatest: row.chain_latest == null ? null : BigInt(row.chain_latest),
    chainSafe: row.chain_safe == null ? null : BigInt(row.chain_safe),
    chainFinalized: row.chain_finalized == null ? null : BigInt(row.chain_finalized),
    lagBlocks: row.lag_blocks == null ? null : BigInt(row.lag_blocks),
    lastRpcOkAt: row.last_rpc_ok_at,
    rpcErrorRate: row.rpc_error_rate,
    reorgCount: BigInt(row.reorg_count),
    dirtyProjections: row.dirty_projections,
    watchlistSize: row.watchlist_size,
    lastQuoteUsdAt: row.last_quote_usd_at,
    candleLagSeconds: row.candle_lag_seconds,
    activeRpc: row.active_rpc,
    wsConnected: row.ws_connected,
    notes: row.notes,
  };
}
