export type LiveScanWindowInput = {
  latest: bigint;
  liveCheckpoint: bigint | null;
  canonicalCheckpoint: bigint | null;
  maxCatchupBlocks: number;
  replayWindowBlocks: number;
  staleLagBlocks: number;
};

export type LiveScanWindow = {
  last: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  jumped: boolean;
  lagBlocks: bigint;
};

/**
 * Resolve the next presentation-only live scan range.
 *
 * Canonical indexing owns complete history. A missing or stale live checkpoint
 * therefore replays only a small near-tip window instead of canonical backlog.
 */
export function resolveLiveScanWindow(input: LiveScanWindowInput): LiveScanWindow {
  const checkpointLag =
    input.liveCheckpoint != null && input.latest > input.liveCheckpoint
      ? input.latest - input.liveCheckpoint
      : input.liveCheckpoint == null &&
          input.canonicalCheckpoint != null &&
          input.latest > input.canonicalCheckpoint
        ? input.latest - input.canonicalCheckpoint
        : 0n;
  const jumped =
    input.liveCheckpoint == null || checkpointLag > BigInt(input.staleLagBlocks);

  const replayStart =
    input.latest > BigInt(input.replayWindowBlocks)
      ? input.latest - BigInt(input.replayWindowBlocks)
      : 0n;
  const last = jumped ? replayStart - 1n : input.liveCheckpoint!;
  const fromBlock = last + 1n;
  const maxEnd = last + BigInt(input.maxCatchupBlocks);
  const toBlock = input.latest < maxEnd ? input.latest : maxEnd;

  return {
    last,
    fromBlock,
    toBlock,
    jumped,
    lagBlocks: checkpointLag,
  };
}
