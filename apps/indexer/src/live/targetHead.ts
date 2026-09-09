import {
  confirmationStatusForBlock,
  type ConfirmationHeads,
  type ConfirmationStatus,
} from './confirmations.js';

/** Default tip lag when SCOOP_CONFIRM_MODE=fixed-lag and lag env is unset. */
export const DEFAULT_FIXED_LAG_BLOCKS = 16;

export type ConfirmMode = 'safe' | 'latest' | 'finalized' | 'fixed-lag';

/**
 * Resolve configured tip lag for fixed-lag mode.
 * Other modes return null (lag only used as RPC-tag fallback in the runner).
 */
export function resolveConfirmLagBlocks(
  mode: ConfirmMode,
  lagBlocks: number | null | undefined,
): number | null {
  if (mode !== 'fixed-lag') return lagBlocks ?? null;
  if (lagBlocks == null) return DEFAULT_FIXED_LAG_BLOCKS;
  return lagBlocks;
}

/**
 * Live indexing target head under the configured confirmation policy.
 * Never indexes past this head; confirmation_status still uses RPC safe/finalized.
 */
export function resolveTargetHead(args: {
  mode: ConfirmMode;
  heads: ConfirmationHeads;
  confirmLagBlocks?: number | null;
}): bigint {
  const { mode, heads } = args;
  switch (mode) {
    case 'safe':
      return heads.safe;
    case 'finalized':
      return heads.finalized;
    case 'latest':
      return heads.latest;
    case 'fixed-lag': {
      const lag = BigInt(resolveConfirmLagBlocks('fixed-lag', args.confirmLagBlocks) ?? DEFAULT_FIXED_LAG_BLOCKS);
      return heads.latest > lag ? heads.latest - lag : 0n;
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Status assigned at ingest time for a block under current heads. */
export function ingestConfirmationStatus(
  blockNumber: bigint,
  heads: ConfirmationHeads,
): ConfirmationStatus {
  return confirmationStatusForBlock(blockNumber, heads);
}
