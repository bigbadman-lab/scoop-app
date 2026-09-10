import { describe, expect, it } from 'vitest';
import { decideMarketService, isFallbackSweepActive } from './decide.js';

describe('decideMarketService', () => {
  const nowSec = 1_700_000_000;

  it('services distribute_only when balances non-zero', () => {
    expect(
      decideMarketService({
        nowSec,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        hasNonZeroDistributorBalance: true,
      }),
    ).toEqual({
      action: 'distribute_only',
      reason: 'non_zero_distributor_balance',
    });
  });

  it('services collect for recent activity', () => {
    expect(
      decideMarketService({
        nowSec,
        lastTradeAt: nowSec - 60,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        hasNonZeroDistributorBalance: false,
      }),
    ).toEqual({ action: 'collect_and_distribute', reason: 'recent_activity' });
  });

  it('skips idle outside fallback window', () => {
    const period = 1440 * 60;
    const idleNow = Math.floor(nowSec / period) * period + 60 * 60; // 1h into period
    expect(
      decideMarketService({
        nowSec: idleNow,
        lastTradeAt: idleNow - 10_000,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        hasNonZeroDistributorBalance: false,
      }),
    ).toEqual({ action: 'skip', reason: 'idle' });
  });

  it('fallback sweep when inside wall-clock window', () => {
    const period = 1440 * 60;
    const sweepNow = Math.floor(nowSec / period) * period + 60; // 1 min into period
    expect(isFallbackSweepActive({ nowSec: sweepNow, fallbackSweepMinutes: 1440 })).toBe(
      true,
    );
    expect(
      decideMarketService({
        nowSec: sweepNow,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        hasNonZeroDistributorBalance: false,
      }),
    ).toEqual({ action: 'collect_and_distribute', reason: 'fallback_sweep' });
  });

  it('adjacent 30-minute cron tick outside slot skips idle market', () => {
    const period = 1440 * 60;
    const dayStart = Math.floor(nowSec / period) * period;
    const atMidnight = dayStart;
    const at0030 = dayStart + 30 * 60;
    const at0100 = dayStart + 60 * 60;

    expect(isFallbackSweepActive({ nowSec: atMidnight, fallbackSweepMinutes: 1440 })).toBe(
      true,
    );
    expect(isFallbackSweepActive({ nowSec: at0030, fallbackSweepMinutes: 1440 })).toBe(
      false,
    );
    expect(isFallbackSweepActive({ nowSec: at0100, fallbackSweepMinutes: 1440 })).toBe(
      false,
    );

    expect(
      decideMarketService({
        nowSec: at0030,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        hasNonZeroDistributorBalance: false,
      }).action,
    ).toBe('skip');
  });

  it('fallback slot is UTC unix-epoch based (timezone independent)', () => {
    const t = 1_704_067_200;
    const a = isFallbackSweepActive({ nowSec: t, fallbackSweepMinutes: 1440 });
    const b = isFallbackSweepActive({ nowSec: t, fallbackSweepMinutes: 1440 });
    expect(a).toBe(b);
    expect(t % 86400).toBe(t % (1440 * 60));
  });

  it('does not open a multi-hour broad window under */30 cadence', () => {
    const period = 1440 * 60;
    const dayStart = Math.floor(nowSec / period) * period;
    let activeTicks = 0;
    for (let m = 0; m < 1440; m += 30) {
      if (
        isFallbackSweepActive({
          nowSec: dayStart + m * 60,
          fallbackSweepMinutes: 1440,
          cronWindowMinutes: 30,
        })
      ) {
        activeTicks += 1;
      }
    }
    // Only 00:00 UTC tick is inside the first 30 minutes of the UTC day.
    expect(activeTicks).toBe(1);
  });
});
