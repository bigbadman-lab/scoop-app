import type { Queryable } from '@scoop/db';
import {
  deleteProcessedBlocksFrom,
  listProcessedBlocksInWindow,
  upsertIndexerCheckpoint,
  getIndexerCheckpoint,
} from '@scoop/db';
import { normalizeBytes32 } from '@scoop/shared';
import { MAIN_STREAM_NAME } from '../config.js';
import { rebuildProjectionsAfterReorg } from './projections/rebuildAfterReorg.js';

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
 * Detect reorg in window, rollback facts, rebuild projections, reset checkpoint.
 */
export async function handleReorgIfNeeded(
  db: Queryable,
  args: {
    chainId: number;
    windowBlocks: number;
    latestIndexed: bigint;
    fetchCanonicalHashes: (from: bigint, to: bigint) => Promise<CanonicalBlockHash[]>;
    streamName?: string;
    quoteUsdMaxAgeSeconds?: number;
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

  await rebuildProjectionsAfterReorg(db, {
    chainId: args.chainId,
    affected: affected.rows,
    quoteUsdMaxAgeSeconds: args.quoteUsdMaxAgeSeconds,
  });

  return { replayFrom, reorg: true };
}
