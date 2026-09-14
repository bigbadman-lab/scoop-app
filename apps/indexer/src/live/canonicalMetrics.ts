/**
 * Canonical loop throughput / lag metrics helpers.
 * behindTarget must always be computed from the same sample of
 * (latest → targetHead, checkpoint), never from a prior loop's "caught up" state.
 */

export type CanonicalLoopMode = 'idle' | 'normal-batch' | 'range-catchup';

export type CanonicalThroughputSnapshot = {
  mode: CanonicalLoopMode;
  latestBlock: bigint;
  targetHead: bigint;
  checkpoint: bigint;
  behindTargetBlocks: bigint;
  latestLagBlocks: bigint;
  batchStart?: bigint;
  batchEnd?: bigint;
  blocksAttempted: number;
  blocksProcessed: number;
  interestingBlocks: number;
  emptyBlocksOrSpans: number;
  rpcMs: number;
  decodeMs: number;
  writeMs: number;
  loopMs: number;
  effectiveBlocksPerSecond: number;
  rpcRetries: number;
  confirmMode: string;
  confirmLagBlocks: number | null;
  liveLagBlocks: bigint | null;
};

export function computeBehindTargetBlocks(args: {
  targetHead: bigint;
  checkpoint: bigint;
}): bigint {
  return args.targetHead > args.checkpoint
    ? args.targetHead - args.checkpoint
    : 0n;
}

export function computeEffectiveBlocksPerSecond(args: {
  blocksSpanned: number;
  loopMs: number;
}): number {
  if (args.loopMs <= 0 || args.blocksSpanned <= 0) return 0;
  return Number(((args.blocksSpanned * 1000) / args.loopMs).toFixed(2));
}

export function formatCanonicalHealthNotes(snapshot: CanonicalThroughputSnapshot): string {
  const parts = [
    snapshot.mode === 'idle'
      ? 'caught up — waiting for new blocks'
      : snapshot.mode === 'range-catchup'
        ? 'range-catchup batch'
        : 'normal-batch',
    `confirmMode=${snapshot.confirmMode}`,
    snapshot.confirmLagBlocks != null
      ? `confirmLagBlocks=${snapshot.confirmLagBlocks}`
      : null,
    `latest=${snapshot.latestBlock.toString()}`,
    `targetHead=${snapshot.targetHead.toString()}`,
    `checkpoint=${snapshot.checkpoint.toString()}`,
    `behindTargetBlocks=${snapshot.behindTargetBlocks.toString()}`,
    `latestLag=${snapshot.latestLagBlocks.toString()}`,
    snapshot.mode !== 'idle'
      ? `blkPerSec=${snapshot.effectiveBlocksPerSecond}`
      : null,
    snapshot.mode !== 'idle' ? `loopMs=${snapshot.loopMs}` : null,
    snapshot.liveLagBlocks != null
      ? `liveLagBlocks=${snapshot.liveLagBlocks.toString()}`
      : null,
  ];
  return parts.filter(Boolean).join(' ');
}

export function logCanonicalThroughput(snapshot: CanonicalThroughputSnapshot): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      message: 'canonical loop throughput',
      mode: snapshot.mode,
      latestBlock: snapshot.latestBlock.toString(),
      targetHead: snapshot.targetHead.toString(),
      checkpoint: snapshot.checkpoint.toString(),
      behindTargetBlocks: snapshot.behindTargetBlocks.toString(),
      latestLagBlocks: snapshot.latestLagBlocks.toString(),
      batchStart: snapshot.batchStart?.toString() ?? null,
      batchEnd: snapshot.batchEnd?.toString() ?? null,
      blocksAttempted: snapshot.blocksAttempted,
      blocksProcessed: snapshot.blocksProcessed,
      interestingBlocks: snapshot.interestingBlocks,
      emptyBlocksOrSpans: snapshot.emptyBlocksOrSpans,
      rpcMs: snapshot.rpcMs,
      decodeMs: snapshot.decodeMs,
      writeMs: snapshot.writeMs,
      loopMs: snapshot.loopMs,
      effectiveBlocksPerSecond: snapshot.effectiveBlocksPerSecond,
      rpcRetries: snapshot.rpcRetries,
      confirmMode: snapshot.confirmMode,
      confirmLagBlocks: snapshot.confirmLagBlocks,
      liveLagBlocks: snapshot.liveLagBlocks?.toString() ?? null,
    }),
  );
}
