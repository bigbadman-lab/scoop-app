/** Product discovery filters — derived, not mutually exclusive. */

export function isNew(
  launchedAt: number | bigint,
  nowSec: number | bigint,
  windowSec = 86400,
): boolean {
  const launched = Number(launchedAt);
  const now = Number(nowSec);
  return launched >= now - windowSec;
}

/**
 * SOON: progress >= threshold AND not complete.
 * Default threshold 8000 bps (80%).
 */
export function isSoon(progressBps: number, complete: boolean, threshold = 8000): boolean {
  return progressBps >= threshold && !complete;
}

/** BONDED: launch inventory/range completion (not a Uniswap migration). */
export function isBonded(complete: boolean): boolean {
  return complete;
}

export type DiscoveryBucket = 'new' | 'soon' | 'bonded';

/** Return all matching buckets — NEW may overlap SOON. */
export function discoveryBuckets(args: {
  launchedAt: number | bigint;
  nowSec: number | bigint;
  progressBps: number;
  complete: boolean;
  windowSec?: number;
  soonThresholdBps?: number;
}): DiscoveryBucket[] {
  const out: DiscoveryBucket[] = [];
  if (isNew(args.launchedAt, args.nowSec, args.windowSec)) out.push('new');
  if (isSoon(args.progressBps, args.complete, args.soonThresholdBps)) out.push('soon');
  if (isBonded(args.complete)) out.push('bonded');
  return out;
}
