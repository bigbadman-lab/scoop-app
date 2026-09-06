import type { Queryable } from '@scoop/db';
import {
  deleteProcessedBlocksFrom,
  listProcessedBlocksInWindow,
  upsertIndexerCheckpoint,
  getIndexerCheckpoint,
} from '@scoop/db';
import { normalizeBytes32 } from '@scoop/shared';
import { MAIN_STREAM_NAME } from '../config.js';
import { refreshTokenMarketFromTrades } from './projections/market.js';

export interface CanonicalBlockHash {
  blockNumber: bigint;
  blockHash: string;
}

export interface ReorgDetectionResult {
  mismatch: boolean;
  reorgFromBlock: bigint | null;
}

/** Find first hash mismatch in the recent processed window vs canonical hashes. */
export function findReorgFromBlock(
  processed: Array<{ blockNumber: bigint | number; blockHash: string }>,
  canonical: CanonicalBlockHash[],
): ReorgDetectionResult {
  const byNumber = new Map(
    canonical.map((c) => [c.blockNumber.toString(), normalizeBytes32(c.blockHash)]),
  );
  for (const row of processed) {
    const key = BigInt(row.blockNumber).toString();
    const expected = byNumber.get(key);
    if (!expected) continue;
    if (normalizeBytes32(row.blockHash) !== expected) {
      return { mismatch: true, reorgFromBlock: BigInt(row.blockNumber) };
    }
  }
  return { mismatch: false, reorgFromBlock: null };
}

/** Delete fact tables from reorg_from_block inclusive. */
export async function deleteFactsFromBlock(
  db: Queryable,
  chainId: number,
  fromBlock: bigint,
): Promise<void> {
  const tables = [
    'trades',
    'transfers',
    'raw_chain_events',
    'fee_distributions',
    'creator_credits',
    'creator_claims',
  ] as const;
  for (const table of tables) {
    await db.query(`DELETE FROM ${table} WHERE chain_id = $1 AND block_number >= $2`, [
      chainId,
      fromBlock.toString(),
    ]);
  }
  await deleteProcessedBlocksFrom(db, chainId, fromBlock);
}

/**
 * Detect reorg in window, rollback facts, reset checkpoint, return replayFrom.
 */
export async function handleReorgIfNeeded(
  db: Queryable,
  args: {
    chainId: number;
    windowBlocks: number;
    latestIndexed: bigint;
    fetchCanonicalHashes: (from: bigint, to: bigint) => Promise<CanonicalBlockHash[]>;
    streamName?: string;
  },
): Promise<{ replayFrom: bigint | null; reorg: boolean }> {
  if (args.latestIndexed <= 0n) return { replayFrom: null, reorg: false };

  const from = args.latestIndexed - BigInt(args.windowBlocks);
  const windowFrom = from < 0n ? 0n : from;
  const processed = await listProcessedBlocksInWindow(
    db,
    args.chainId,
    windowFrom,
    args.latestIndexed,
  );
  if (processed.length === 0) return { replayFrom: null, reorg: false };

  const canonical = await args.fetchCanonicalHashes(windowFrom, args.latestIndexed);
  const detection = findReorgFromBlock(processed, canonical);
  if (!detection.mismatch || detection.reorgFromBlock == null) {
    return { replayFrom: null, reorg: false };
  }

  const reorgFrom = detection.reorgFromBlock;
  const affected = await db.query<{ token_address: string; pool_id: string }>(
    `SELECT DISTINCT token_address, pool_id FROM trades
     WHERE chain_id = $1 AND block_number >= $2
     UNION
     SELECT token_address, pool_id FROM launches
     WHERE chain_id = $1 AND launch_block >= $2`,
    [args.chainId, reorgFrom.toString()],
  );

  await deleteFactsFromBlock(db, args.chainId, reorgFrom);

  // Reset checkpoint to block before reorg
  const replayFrom = reorgFrom > 0n ? reorgFrom - 1n : 0n;
  const parent = await getIndexerCheckpoint(
    db,
    args.chainId,
    args.streamName ?? MAIN_STREAM_NAME,
  );
  await upsertIndexerCheckpoint(db, {
    chainId: args.chainId,
    streamName: args.streamName ?? MAIN_STREAM_NAME,
    lastBlockNumber: replayFrom,
    lastBlockHash: parent?.lastBlockHash ?? `0x${'0'.repeat(64)}`,
    lastLogIndex: -1,
  });

  // Rebuild projections for affected tokens from remaining trades
  for (const row of affected.rows) {
    const launch = await db.query<{
      tick_lower: number;
      tick_upper: number;
      opening_sqrt_price_x96: string;
      pool_id: string;
    }>(
      `SELECT tick_lower, tick_upper, opening_sqrt_price_x96, pool_id
       FROM launches WHERE chain_id = $1 AND token_address = $2`,
      [args.chainId, row.token_address],
    );
    const L = launch.rows[0];
    if (!L) continue;
    const lastTrade = await db.query<{
      sqrt_price_x96_after: string;
      tick_after: number;
      liquidity_after_raw: string;
      block_number: string;
      tx_hash: string;
      log_index: number;
    }>(
      `SELECT sqrt_price_x96_after, tick_after, liquidity_after_raw, block_number, tx_hash, log_index
       FROM trades
       WHERE chain_id = $1 AND token_address = $2
       ORDER BY block_number DESC, log_index DESC LIMIT 1`,
      [args.chainId, row.token_address],
    );
    const t = lastTrade.rows[0];
    if (!t) continue;
    await refreshTokenMarketFromTrades(db, {
      chainId: args.chainId,
      tokenAddress: row.token_address,
      poolId: L.pool_id,
      tickLower: L.tick_lower,
      tickUpper: L.tick_upper,
      openingSqrtPriceX96: BigInt(L.opening_sqrt_price_x96),
      liquidityRaw: BigInt(t.liquidity_after_raw),
      sqrtPriceX96: BigInt(t.sqrt_price_x96_after),
      tick: t.tick_after,
      sourceBlock: BigInt(t.block_number),
      sourceTxHash: t.tx_hash,
      sourceLogIndex: t.log_index,
    });
  }

  return { replayFrom, reorg: true };
}
