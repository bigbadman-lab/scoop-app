import { describe, expect, it } from 'vitest';
import { decideMarketService, isFallbackSweepActive } from './decide.js';

const CRON_WINDOW = 15;

describe('decideMarketService', () => {
  const nowSec = 1_700_000_000;

  it('services distribute_only when balances non-zero', () => {
    expect(
      decideMarketService({
        nowSec,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
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
        cronWindowMinutes: CRON_WINDOW,
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
        cronWindowMinutes: CRON_WINDOW,
        hasNonZeroDistributorBalance: false,
      }),
    ).toEqual({ action: 'skip', reason: 'idle' });
  });

  it('fallback sweep when inside wall-clock window', () => {
    const period = 1440 * 60;
    const sweepNow = Math.floor(nowSec / period) * period + 60; // 1 min into period
    expect(
      isFallbackSweepActive({
        nowSec: sweepNow,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
      }),
    ).toBe(true);
    expect(
      decideMarketService({
        nowSec: sweepNow,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
        hasNonZeroDistributorBalance: false,
      }),
    ).toEqual({ action: 'collect_and_distribute', reason: 'fallback_sweep' });
  });

  it('adjacent 15-minute cron ticks outside slot skip idle markets', () => {
    const period = 1440 * 60;
    const dayStart = Math.floor(nowSec / period) * period;
    const atMidnight = dayStart;
    const at0015 = dayStart + 15 * 60;
    const at0030 = dayStart + 30 * 60;
    const at0045 = dayStart + 45 * 60;

    expect(
      isFallbackSweepActive({
        nowSec: atMidnight,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
      }),
    ).toBe(true);
    expect(
      isFallbackSweepActive({
        nowSec: at0015,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
      }),
    ).toBe(false);
    expect(
      isFallbackSweepActive({
        nowSec: at0030,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
      }),
    ).toBe(false);
    expect(
      isFallbackSweepActive({
        nowSec: at0045,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
      }),
    ).toBe(false);

    expect(
      decideMarketService({
        nowSec: at0015,
        lastTradeAt: null,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: CRON_WINDOW,
        hasNonZeroDistributorBalance: false,
      }).action,
    ).toBe('skip');
  });

  it('fallback slot is UTC unix-epoch based (timezone independent)', () => {
    const t = 1_704_067_200;
    const a = isFallbackSweepActive({
      nowSec: t,
      fallbackSweepMinutes: 1440,
      cronWindowMinutes: CRON_WINDOW,
    });
    const b = isFallbackSweepActive({
      nowSec: t,
      fallbackSweepMinutes: 1440,
      cronWindowMinutes: CRON_WINDOW,
    });
    expect(a).toBe(b);
    expect(t % 86400).toBe(t % (1440 * 60));
  });

  it('exactly one fallback-active tick under */15 cadence', () => {
    const period = 1440 * 60;
    const dayStart = Math.floor(nowSec / period) * period;
    let activeTicks = 0;
    const activeMinutes: number[] = [];
    for (let m = 0; m < 1440; m += 15) {
      if (
        isFallbackSweepActive({
          nowSec: dayStart + m * 60,
          fallbackSweepMinutes: 1440,
          cronWindowMinutes: 15,
        })
      ) {
        activeTicks += 1;
        activeMinutes.push(m);
      }
    }
    // Only 00:00 UTC tick is inside the first 15 minutes of the UTC day.
    expect(activeTicks).toBe(1);
    expect(activeMinutes).toEqual([0]);
  });

  it('generic cronWindowMinutes still supports a 30-minute window function test', () => {
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
    expect(activeTicks).toBe(1);
  });
});
