/**
 * Pure servicing decision — no USD/oracle profitability.
 *
 * Fallback without persistent last-serviced state:
 * wall-clock window once per FALLBACK_SWEEP_MINUTES (see isFallbackSweepActive).
 */

export type ServicingDecision =
  | { action: 'distribute_only'; reason: 'non_zero_distributor_balance' }
  | { action: 'collect_and_distribute'; reason: 'recent_activity' | 'fallback_sweep' }
  | { action: 'skip'; reason: 'idle' };

export function isFallbackSweepActive(input: {
  nowSec: number;
  fallbackSweepMinutes: number;
  /** Cron cadence window that counts as "this sweep's run" (default 30). */
  cronWindowMinutes?: number;
}): boolean {
  const periodSec = input.fallbackSweepMinutes * 60;
  if (periodSec <= 0) return false;
  const windowSec = (input.cronWindowMinutes ?? 30) * 60;
  const phase = ((input.nowSec % periodSec) + periodSec) % periodSec;
  return phase < windowSec;
}

export function decideMarketService(input: {
  nowSec: number;
  lastTradeAt: number | null;
  activityLookbackMinutes: number;
  fallbackSweepMinutes: number;
  /** True if ETH or any relevant ERC-20 balance on distributor is > 0. */
  hasNonZeroDistributorBalance: boolean;
}): ServicingDecision {
  if (input.hasNonZeroDistributorBalance) {
    return { action: 'distribute_only', reason: 'non_zero_distributor_balance' };
  }

  const lookbackSec = input.activityLookbackMinutes * 60;
  if (
    input.lastTradeAt != null &&
    Number.isFinite(input.lastTradeAt) &&
    input.nowSec - input.lastTradeAt <= lookbackSec
  ) {
    return { action: 'collect_and_distribute', reason: 'recent_activity' };
  }

  if (
    isFallbackSweepActive({
      nowSec: input.nowSec,
      fallbackSweepMinutes: input.fallbackSweepMinutes,
    })
  ) {
    return { action: 'collect_and_distribute', reason: 'fallback_sweep' };
  }

  return { action: 'skip', reason: 'idle' };
}
