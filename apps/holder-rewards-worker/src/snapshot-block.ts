/**
 * Deterministic snapshot block resolution for hourly rounds.
 * Never uses holder_balances; never uses worker execution time as snapshot.
 */
import type { Queryable } from '@scoop/db';
import {
  getIndexerMainCheckpointBlock,
  getWorkerRound,
  resolveSnapshotBlockForHourEnd,
} from '@scoop/db';
import { hourEndUnixFromRoundId } from '@scoop/shared';

export type SnapshotNotReady = {
  ok: false;
  reason: 'snapshot_not_ready';
  roundId: number;
  targetHourEnd: number;
  candidateSnapshotBlock: number | null;
  indexedThroughBlock: number | null;
  requiredConfirmations: number;
  detail: string;
};

export type SnapshotReady = {
  ok: true;
  roundId: number;
  targetHourEnd: number;
  snapshotBlock: number;
  snapshotTimestamp: number;
  indexedThroughBlock: number;
  requiredConfirmations: number;
  persisted: boolean;
};

export type ResolveSnapshotResult = SnapshotReady | SnapshotNotReady;

/**
 * Policy:
 * 1. hourEndUnix = (roundId + 1) * 3600
 * 2. If a worker round already persisted snapshot_block → reuse (immutable)
 * 3. Else highest processed_blocks.block_timestamp <= hourEnd
 * 4. Require indexer main checkpoint >= snapshotBlock + confirmations
 * 5. Fail snapshot_not_ready if any check fails (no partial root)
 */
export async function resolveSnapshotBlock(args: {
  db: Queryable;
  chainId: number;
  vaultAddress: string;
  assetAddress: string;
  roundId: number;
  confirmations: number;
}): Promise<ResolveSnapshotResult> {
  const targetHourEnd = hourEndUnixFromRoundId(args.roundId);
  const indexedThrough = await getIndexerMainCheckpointBlock(
    args.db,
    args.chainId,
  );

  const existing = await getWorkerRound(args.db, {
    chainId: args.chainId,
    vaultAddress: args.vaultAddress,
    roundId: args.roundId,
    assetAddress: args.assetAddress,
  });
  if (existing && existing.snapshotBlock > 0) {
    if (
      indexedThrough == null ||
      indexedThrough < existing.snapshotBlock + args.confirmations
    ) {
      return {
        ok: false,
        reason: 'snapshot_not_ready',
        roundId: args.roundId,
        targetHourEnd,
        candidateSnapshotBlock: existing.snapshotBlock,
        indexedThroughBlock: indexedThrough,
        requiredConfirmations: args.confirmations,
        detail: 'persisted snapshot lacks indexer confirmations',
      };
    }
    return {
      ok: true,
      roundId: args.roundId,
      targetHourEnd,
      snapshotBlock: existing.snapshotBlock,
      snapshotTimestamp: existing.hourEndUnix,
      indexedThroughBlock: indexedThrough,
      requiredConfirmations: args.confirmations,
      persisted: true,
    };
  }

  const candidate = await resolveSnapshotBlockForHourEnd(args.db, {
    chainId: args.chainId,
    hourEndUnix: targetHourEnd,
  });
  if (!candidate) {
    return {
      ok: false,
      reason: 'snapshot_not_ready',
      roundId: args.roundId,
      targetHourEnd,
      candidateSnapshotBlock: null,
      indexedThroughBlock: indexedThrough,
      requiredConfirmations: args.confirmations,
      detail: 'no processed_blocks with timestamp <= hourEnd',
    };
  }

  if (
    indexedThrough == null ||
    indexedThrough < candidate.blockNumber + args.confirmations
  ) {
    return {
      ok: false,
      reason: 'snapshot_not_ready',
      roundId: args.roundId,
      targetHourEnd,
      candidateSnapshotBlock: candidate.blockNumber,
      indexedThroughBlock: indexedThrough,
      requiredConfirmations: args.confirmations,
      detail: 'indexer behind confirmations for candidate snapshot',
    };
  }

  return {
    ok: true,
    roundId: args.roundId,
    targetHourEnd,
    snapshotBlock: candidate.blockNumber,
    snapshotTimestamp: candidate.blockTimestamp,
    indexedThroughBlock: indexedThrough,
    requiredConfirmations: args.confirmations,
    persisted: false,
  };
}
