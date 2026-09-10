import { BASE_FEE } from '@scoop/shared';
import type { DecodedChainEvent } from '../decode.js';

export interface LaunchEconomicsFromEvents {
  additionalFee: number;
  totalPoolFee: number;
  creatorAllocationDestination: 0 | 1;
  additionalFeeDestination: 0 | 1 | 2;
  holderRewardsAddress: string | null;
  feeDistributorAddress?: string;
  liquidityLockerAddress?: string;
}

function asUint(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asDest0_1(value: unknown): 0 | 1 {
  const n = asUint(value, 0);
  return n === 1 ? 1 : 0;
}

function asDest0_2(value: unknown): 0 | 1 | 2 {
  const n = asUint(value, 0);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 0;
}

/**
 * Prefer TokenLaunched fields; overlay LaunchEconomicsConfigured when present.
 * Historical canary TokenLaunched lacks economics → BASE_FEE defaults, null vault.
 */
export function extractLaunchEconomics(
  decoded: DecodedChainEvent[],
): LaunchEconomicsFromEvents {
  const launched = decoded.find((e) => e.kind === 'TokenLaunched');
  const economics = decoded.find((e) => e.kind === 'LaunchEconomicsConfigured');
  const src: Record<string, unknown> =
    (economics && economics.kind !== 'unknown' ? economics.args : undefined) ??
    (launched && launched.kind !== 'unknown' ? launched.args : undefined) ??
    {};

  const hasCanonical =
    src.additionalFee != null ||
    src.totalPoolFee != null ||
    src.holderRewards != null ||
    src.creatorAllocationDestination != null;

  if (!hasCanonical) {
    return {
      additionalFee: 0,
      totalPoolFee: BASE_FEE,
      creatorAllocationDestination: 0,
      additionalFeeDestination: 0,
      holderRewardsAddress: null,
    };
  }

  const additionalFee = asUint(src.additionalFee, 0);
  const totalPoolFee = asUint(src.totalPoolFee, BASE_FEE + additionalFee);
  const holder =
    src.holderRewards != null ? String(src.holderRewards).toLowerCase() : null;

  return {
    additionalFee,
    totalPoolFee,
    creatorAllocationDestination: asDest0_1(src.creatorAllocationDestination),
    additionalFeeDestination: asDest0_2(src.additionalFeeDestination),
    holderRewardsAddress:
      holder && holder !== '0x0000000000000000000000000000000000000000'
        ? holder
        : null,
    feeDistributorAddress:
      src.feeDistributor != null ? String(src.feeDistributor) : undefined,
    liquidityLockerAddress:
      src.liquidityLocker != null ? String(src.liquidityLocker) : undefined,
  };
}
