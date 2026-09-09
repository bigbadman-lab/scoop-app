import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  MIN_SLIPPAGE_BPS,
} from '@/lib/trade/constants';

/** Reject invalid slippage; returns normalized integer bps. */
export function assertSlippageBps(bps: number): number {
  if (!Number.isInteger(bps) || bps < MIN_SLIPPAGE_BPS || bps > MAX_SLIPPAGE_BPS) {
    throw new Error(`Slippage must be an integer between ${MIN_SLIPPAGE_BPS} and ${MAX_SLIPPAGE_BPS} bps`);
  }
  return bps;
}

/**
 * minimumOut = amountOut * (10_000 - slippageBps) / 10_000
 * Uses bigint only — never JS float.
 */
export function minimumAmountOut(amountOut: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  const bps = assertSlippageBps(slippageBps);
  if (amountOut <= BigInt(0)) return BigInt(0);
  return (amountOut * BigInt(10_000 - bps)) / BigInt(10_000);
}

export function isNonZeroAmount(amount: bigint): boolean {
  return amount > BigInt(0);
}
