import type { Queryable } from '../types.js';
import type { IndexerStatus } from '../dto.js';

const STALE_HEARTBEAT_MS = 120_000;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function toNum(value: string | number | bigint | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export async function getIndexerStatus(
  db: Queryable,
  chainId: number,
): Promise<IndexerStatus | null> {
  const result = await db.query(
    `
    SELECT
      chain_id,
      heartbeat_at,
      latest_indexed_block,
      chain_latest,
      chain_safe,
      chain_finalized,
      lag_blocks,
      last_rpc_ok_at,
      reorg_count,
      dirty_projections,
      watchlist_size,
      active_rpc,
      ws_connected,
      notes
    FROM indexer_health
    WHERE chain_id = $1
    LIMIT 1
    `,
    [chainId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const heartbeatAt = toIso(row.heartbeat_at as Date | string | null);
  const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : NaN;
  const lagBlocks = toNum(row.lag_blocks as string | null);
  const latestIndexedBlock = toNum(row.latest_indexed_block as string | null);
  const chainLatest = toNum(row.chain_latest as string | null);
  const chainSafe = toNum(row.chain_safe as string | null);
  const latestLagBlocks =
    chainLatest != null && latestIndexedBlock != null
      ? Math.max(0, chainLatest - latestIndexedBlock)
      : null;
  const safeLagBlocks =
    chainLatest != null && chainSafe != null ? Math.max(0, chainLatest - chainSafe) : null;
  // Healthy vs configured target lag (runner stores targetHead − indexed in lag_blocks).
  const healthy =
    Boolean(heartbeatAt) &&
    !Number.isNaN(heartbeatMs) &&
    Date.now() - heartbeatMs < STALE_HEARTBEAT_MS &&
    !Boolean(row.dirty_projections) &&
    (lagBlocks == null || lagBlocks < 500);

  return {
    chainId: Number(row.chain_id),
    heartbeatAt,
    latestIndexedBlock,
    chainLatest,
    chainSafe,
    chainFinalized: toNum(row.chain_finalized as string | null),
    lagBlocks,
    latestLagBlocks,
    safeLagBlocks,
    lastRpcOkAt: toIso(row.last_rpc_ok_at as Date | string | null),
    reorgCount: Number(row.reorg_count ?? 0),
    dirtyProjections: Boolean(row.dirty_projections),
    watchlistSize: Number(row.watchlist_size ?? 0),
    activeRpc: row.active_rpc == null ? null : String(row.active_rpc),
    wsConnected: Boolean(row.ws_connected),
    notes: row.notes == null ? null : String(row.notes),
    healthy,
  };
}
