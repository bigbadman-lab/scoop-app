import { describe, expect, it } from 'vitest';
import {
  HELLO_FIXTURE,
  getSqrtRatioAtTick,
  getAmount0ForLiquidity,
  getAmount1ForLiquidity,
  getAmountsForLiquidity,
  amountTokenInPosition,
  launchProgressBps,
  isLaunchComplete,
  computeLaunchProgress,
  isNew,
  isSoon,
  isBonded,
  discoveryBuckets,
  DEFAULT_LAUNCH_DUST_RAW,
  NEW_MARKET_WINDOW_SECONDS,
} from './index.js';

describe('getSqrtRatioAtTick', () => {
  it('returns known tick 0 = Q96', () => {
    expect(getSqrtRatioAtTick(0)).toBe(2n ** 96n);
  });

  it('matches HELLO tick bounds approximately vs stored sqrts', () => {
    const lower = getSqrtRatioAtTick(HELLO_FIXTURE.tickLower);
    const upper = getSqrtRatioAtTick(HELLO_FIXTURE.tickUpper);
    expect(lower > 0n).toBe(true);
    expect(upper > lower).toBe(true);
    // opening price between lower and upper for HELLO one-sided sell range
    expect(HELLO_FIXTURE.openingSqrtPriceX96 > lower).toBe(true);
    expect(HELLO_FIXTURE.openingSqrtPriceX96 > upper).toBe(true); // above upper at open (token inventory)
  });

  it('rejects out-of-bounds ticks', () => {
    expect(() => getSqrtRatioAtTick(887273)).toThrow(/Invalid tick/);
  });
});

describe('liquidity amounts', () => {
  const liq = 1_000_000n;
  const sqrtA = getSqrtRatioAtTick(-100);
  const sqrtB = getSqrtRatioAtTick(100);

  it('amount0/amount1 are positive in range mid', () => {
    const mid = getSqrtRatioAtTick(0);
    const { amount0, amount1 } = getAmountsForLiquidity(mid, sqrtA, sqrtB, liq);
    expect(amount0 > 0n).toBe(true);
    expect(amount1 > 0n).toBe(true);
  });

  it('below range is all token0', () => {
    const below = getSqrtRatioAtTick(-200);
    const { amount0, amount1 } = getAmountsForLiquidity(below, sqrtA, sqrtB, liq);
    expect(amount0).toBe(getAmount0ForLiquidity(sqrtA, sqrtB, liq));
    expect(amount1).toBe(0n);
  });

  it('above range is all token1', () => {
    const above = getSqrtRatioAtTick(200);
    const { amount0, amount1 } = getAmountsForLiquidity(above, sqrtA, sqrtB, liq);
    expect(amount0).toBe(0n);
    expect(amount1).toBe(getAmount1ForLiquidity(sqrtA, sqrtB, liq));
  });
});

describe('launch progress', () => {
  const sqrtLower = getSqrtRatioAtTick(HELLO_FIXTURE.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(HELLO_FIXTURE.tickUpper);
  const liq = HELLO_FIXTURE.postSwapLiquidity;

  it('HELLO orientation uses currency1 token inventory', () => {
    const inv = amountTokenInPosition({
      liquidity: liq,
      sqrtPriceX96: HELLO_FIXTURE.postSwapSqrtPriceX96,
      sqrtLower,
      sqrtUpper,
      tokenIsCurrency1: true,
    });
    const as0 = amountTokenInPosition({
      liquidity: liq,
      sqrtPriceX96: HELLO_FIXTURE.postSwapSqrtPriceX96,
      sqrtLower,
      sqrtUpper,
      tokenIsCurrency1: false,
    });
    expect(inv > 0n).toBe(true);
    // At post-swap HELLO is still above lower and typically near/above upper → mostly amount1
    expect(inv).not.toBe(as0);
  });

  it('progress bps clamps and completes', () => {
    expect(launchProgressBps({ initialTokenInventory: 0n, currentTokenInventory: 0n })).toBe(0);
    expect(launchProgressBps({ initialTokenInventory: 100n, currentTokenInventory: 100n })).toBe(0);
    expect(launchProgressBps({ initialTokenInventory: 100n, currentTokenInventory: 150n })).toBe(0);
    expect(launchProgressBps({ initialTokenInventory: 100n, currentTokenInventory: 50n })).toBe(5000);
    expect(launchProgressBps({ initialTokenInventory: 100n, currentTokenInventory: 0n })).toBe(10000);
    expect(isLaunchComplete({ progressBps: 10000, currentTokenInventory: 1n })).toBe(true);
    expect(
      isLaunchComplete({
        progressBps: 0,
        currentTokenInventory: DEFAULT_LAUNCH_DUST_RAW,
      }),
    ).toBe(true);
    expect(
      isLaunchComplete({
        progressBps: 0,
        currentTokenInventory: DEFAULT_LAUNCH_DUST_RAW + 1n,
      }),
    ).toBe(false);
  });

  it('computeLaunchProgress below/above/within and orientations', () => {
    const base = {
      liquidity: liq,
      sqrtLower,
      sqrtUpper,
      openingSqrtPriceX96: HELLO_FIXTURE.openingSqrtPriceX96,
    };

    const within = computeLaunchProgress({
      ...base,
      sqrtPriceX96: HELLO_FIXTURE.postSwapSqrtPriceX96,
      tokenIsCurrency1: true,
    });
    expect(within.progressBps).toBeGreaterThanOrEqual(0);
    expect(within.progressBps).toBeLessThanOrEqual(10000);

    const below = computeLaunchProgress({
      ...base,
      sqrtPriceX96: sqrtLower > 1n ? sqrtLower - 1n : sqrtLower,
      tokenIsCurrency1: true,
    });
    // below range → amount1=0 → inventory dust → complete for currency1
    expect(below.currentTokenInventory).toBe(0n);
    expect(below.complete).toBe(true);
    expect(below.progressBps).toBe(10000);

    const c0 = computeLaunchProgress({
      liquidity: 1_000_000n,
      sqrtPriceX96: getSqrtRatioAtTick(0),
      sqrtLower: getSqrtRatioAtTick(-100),
      sqrtUpper: getSqrtRatioAtTick(100),
      tokenIsCurrency1: false,
      openingSqrtPriceX96: getSqrtRatioAtTick(-50),
    });
    expect(c0.initialTokenInventory > 0n).toBe(true);
  });
});

describe('discovery filters NEW/SOON/BONDED', () => {
  const now = 1_700_000_000;
  const day = 24 * 60 * 60;

  it('NEW uses 7-day product window by default', () => {
    expect(NEW_MARKET_WINDOW_SECONDS).toBe(7 * day);
    expect(isNew(now - 100, now)).toBe(true);
    expect(isNew(now - day, now)).toBe(true);
    expect(isNew(now - 2 * day, now)).toBe(true);
    expect(isNew(now - (6 * day + 23 * 3600), now)).toBe(true);
    expect(isNew(now - 7 * day, now)).toBe(true); // exactly 7d still in window (>= now - window)
    expect(isNew(now - 7 * day - 1, now)).toBe(false);
  });

  it('SOON requires threshold and not complete', () => {
    expect(isSoon(8000, false)).toBe(true);
    expect(isSoon(7999, false)).toBe(false);
    expect(isSoon(9000, true)).toBe(false);
  });

  it('BONDED is complete only', () => {
    expect(isBonded(true)).toBe(true);
    expect(isBonded(false)).toBe(false);
  });

  it('NEW may overlap SOON', () => {
    const buckets = discoveryBuckets({
      launchedAt: now - 60,
      nowSec: now,
      progressBps: 8500,
      complete: false,
    });
    expect(buckets).toContain('new');
    expect(buckets).toContain('soon');
    expect(buckets).not.toContain('bonded');
  });
});
