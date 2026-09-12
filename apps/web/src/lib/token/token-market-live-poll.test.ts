import { describe, expect, it, vi } from 'vitest';
import type { TokenDetail, TradeItem } from '@scoop/db';
import { helloTradesNewestFirst } from '@/lib/token/hello-trades.fixture';
import { TOKEN_MARKET_LIVE_POLL_MS } from '@/lib/token/live-market';
import { createTokenMarketLivePoll } from '@/lib/token/token-market-live-poll';
import { tradeIdentity } from '@/lib/token/trade-series';

function baseToken(overrides: Partial<TokenDetail> = {}): TokenDetail {
  return {
    chainId: 4663,
    tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    name: 'Hello World',
    symbol: 'HELLO',
    decimals: 18,
    imageUri: '',
    displayImageUrl: null,
    poolId: '0xpool',
    creatorId: '0x1111111111111111111111111111111111111111',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    launchedAt: 1,
    ageSeconds: 100,
    launchProgressBps: 5100,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: '1',
    priceQuoteDisplay: '0.000000001',
    priceUsdX18: '2',
    priceUsdDisplay: '0.000000002',
    fdvUsdX18: '2000',
    fdvUsdDisplay: '0.000000002000',
    volume24hQuoteRaw: '1',
    volume24hQuoteDisplay: '0.001',
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: 1,
    tradeCountAllTime: null,
    buyCount24h: null,
    sellCount24h: null,
    holderCountAll: 3,
    holderCountRetail: 2,
    lastTradeAt: null,
    priceChange24hBps: 0,
    description: '',
    twitter: '',
    telegram: '',
    discord: '',
    website: '',
    farcaster: '',
    totalSupplyRaw: '1000000000000000000000000000',
    totalSupplyDisplay: '1000000000',
    deployerAddress: '0x2222222222222222222222222222222222222222',
    factoryAddress: '0x3333333333333333333333333333333333333333',
    feeDistributorAddress: '0x4444444444444444444444444444444444444444',
    liquidityLockerAddress: '0x5555555555555555555555555555555555555555',
    sqrtPriceX96: null,
    tick: null,
    liquidityRaw: null,
    quoteUsdX18: null,
    quoteVolumeAllTimeRaw: null,
    tokenVolumeAllTimeRaw: null,
    buyCountAllTime: null,
    sellCountAllTime: null,
    initialTokenInventoryRaw: null,
    currentTokenInventoryRaw: null,
    sourceBlock: null,
    poolFee: 10000,
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    tickSpacing: 10,
    hooks: '0x0000000000000000000000000000000000000000',
    creatorFeesLifetimeEthRaw: null,
    creatorFeesLifetimeEthDisplay: null,
    buybackFeesLifetimeEthRaw: null,
    buybackFeesLifetimeEthDisplay: null,
    ...overrides,
  };
}

type Scheduled = { fn: () => void; ms: number; id: number };

function createScheduler() {
  const timeouts: Scheduled[] = [];
  let nextId = 1;
  return {
    timeouts,
    setTimeoutFn: ((fn: () => void, ms?: number) => {
      const id = nextId++;
      timeouts.push({ fn: fn as () => void, ms: ms ?? 0, id });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeoutFn: ((id: ReturnType<typeof setTimeout>) => {
      const idx = timeouts.findIndex((t) => t.id === (id as unknown as number));
      if (idx >= 0) timeouts.splice(idx, 1);
    }) as typeof clearTimeout,
    async flushOne() {
      const tick = timeouts.shift();
      if (!tick) return false;
      tick.fn();
      return true;
    },
  };
}

describe('createTokenMarketLivePoll', () => {
  it('starts once, polls after completion, stops on unmount, and avoids overlap', async () => {
    const token = baseToken();
    const trades = helloTradesNewestFirst();
    let hidden = false;
    const scheduler = createScheduler();
    const snapshots: Array<{ price: string | null; tradeCount: number; status: string }> = [];

    let detailCalls = 0;
    let tradeCalls = 0;
    let inFlightDetail = 0;
    let maxInFlight = 0;

    const poll = createTokenMarketLivePoll({
      tokenAddress: token.tokenAddress,
      initialToken: token,
      pollMs: TOKEN_MARKET_LIVE_POLL_MS,
      isDocumentHidden: () => hidden,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => undefined,
      fetchDetail: async () => {
        detailCalls += 1;
        inFlightDetail += 1;
        maxInFlight = Math.max(maxInFlight, inFlightDetail);
        inFlightDetail -= 1;
        return {
          ok: true,
          token: baseToken({
            priceUsdX18: String(2 + detailCalls),
            priceUsdDisplay: `0.00000000${2 + detailCalls}`,
            fdvUsdX18: String(2000 + detailCalls),
            fdvUsdDisplay: String(2000 + detailCalls),
            holderCountRetail: 2 + detailCalls,
            volume24hQuoteDisplay: '0.002',
          }),
        };
      },
      fetchTrades: async () => {
        tradeCalls += 1;
        return { ok: true, items: trades };
      },
      clearTradesCache: () => undefined,
      onSnapshot: (snap) => {
        snapshots.push({
          price: snap.token.priceUsdDisplay,
          tradeCount: snap.tradesChronoAsc.length,
          status: snap.tradesStatus,
        });
      },
    });

    poll.start();
    poll.start(); // idempotent
    await vi.waitFor(() =>
      expect(snapshots.some((s) => s.status === 'ready' && s.tradeCount === trades.length)).toBe(
        true,
      ),
    );
    expect(detailCalls).toBe(1);
    expect(tradeCalls).toBe(1);
    expect(snapshots.at(-1)?.tradeCount).toBe(trades.length);
    expect(snapshots.at(-1)?.price).toMatch(/3$/);

    expect(scheduler.timeouts).toHaveLength(1);
    expect(scheduler.timeouts[0]!.ms).toBe(TOKEN_MARKET_LIVE_POLL_MS);
    await scheduler.flushOne();
    await vi.waitFor(() => expect(detailCalls).toBe(2));
    await vi.waitFor(() => expect(snapshots.at(-1)?.price).toMatch(/4$/));
    expect(maxInFlight).toBe(1);

    hidden = true;
    // Drop any pending schedule; hidden path should not re-queue.
    scheduler.timeouts.length = 0;
    poll.refreshNow();
    await vi.waitFor(() => expect(detailCalls).toBe(3));
    expect(scheduler.timeouts).toHaveLength(0);

    hidden = false;
    poll.refreshNow();
    await vi.waitFor(() => expect(detailCalls).toBe(4));
    await vi.waitFor(() => expect(scheduler.timeouts.length).toBeGreaterThanOrEqual(1));

    poll.stop();
    const callsAfterStop = detailCalls;
    while (await scheduler.flushOne()) {
      /* drain */
    }
    await Promise.resolve();
    expect(detailCalls).toBe(callsAfterStop);
  });

  it('preserves last good trades on transient failure and recovers', async () => {
    const token = baseToken();
    const trades = helloTradesNewestFirst();
    let failTrades = false;
    const snaps: Array<{ status: string; ids: string }> = [];
    const scheduler = createScheduler();

    const poll = createTokenMarketLivePoll({
      tokenAddress: token.tokenAddress,
      initialToken: token,
      pollMs: 10,
      isDocumentHidden: () => false,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => undefined,
      fetchDetail: async () => ({ ok: true, token }),
      fetchTrades: async () => {
        if (failTrades) return { ok: false, error: 'Trades unavailable' };
        return { ok: true, items: trades };
      },
      clearTradesCache: () => undefined,
      onSnapshot: (snap) => {
        snaps.push({
          status: snap.tradesStatus,
          ids: snap.tradesChronoAsc.map((t: TradeItem) => tradeIdentity(t)).join(','),
        });
      },
    });

    poll.start();
    await vi.waitFor(() => expect(snaps.some((s) => s.status === 'ready')).toBe(true));
    const good = snaps.find((s) => s.status === 'ready')!;
    expect(good.ids.length).toBeGreaterThan(0);

    failTrades = true;
    await scheduler.flushOne();
    await vi.waitFor(() => expect(scheduler.timeouts.length).toBeGreaterThan(0));
    expect(snaps.at(-1)?.status).toBe('ready');
    expect(snaps.at(-1)?.ids).toBe(good.ids);

    failTrades = false;
    await scheduler.flushOne();
    await vi.waitFor(() => expect(snaps.at(-1)?.status).toBe('ready'));
    expect(snaps.at(-1)?.ids).toBe(good.ids);

    poll.stop();
  });

  it('does not emit token churn when payload fingerprint is unchanged', async () => {
    const token = baseToken();
    let emits = 0;
    const scheduler = createScheduler();

    const poll = createTokenMarketLivePoll({
      tokenAddress: token.tokenAddress,
      initialToken: token,
      pollMs: 5,
      isDocumentHidden: () => false,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => undefined,
      fetchDetail: async () => ({ ok: true, token }),
      fetchTrades: async () => ({ ok: true, items: [] }),
      clearTradesCache: () => undefined,
      onSnapshot: () => {
        emits += 1;
      },
    });

    poll.start();
    await vi.waitFor(() => expect(emits).toBeGreaterThanOrEqual(2));
    const afterSettled = emits;

    await scheduler.flushOne();
    await scheduler.flushOne();
    await scheduler.flushOne();
    await vi.waitFor(() => expect(scheduler.timeouts.length).toBeGreaterThan(0));

    // Identical polls must not keep emitting.
    expect(emits).toBe(afterSettled);
    poll.stop();
  });

  it('visibility restore path can trigger immediate refresh', async () => {
    const token = baseToken();
    const scheduler = createScheduler();
    let hidden = true;
    let visibilityHandler: (() => void) | null = null;
    let detailCalls = 0;

    const poll = createTokenMarketLivePoll({
      tokenAddress: token.tokenAddress,
      initialToken: token,
      pollMs: TOKEN_MARKET_LIVE_POLL_MS,
      isDocumentHidden: () => hidden,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: (listener) => {
        visibilityHandler = listener;
        return () => {
          visibilityHandler = null;
        };
      },
      fetchDetail: async () => {
        detailCalls += 1;
        return { ok: true, token };
      },
      fetchTrades: async () => ({ ok: true, items: [] }),
      clearTradesCache: () => undefined,
      onSnapshot: () => undefined,
    });

    poll.start();
    await vi.waitFor(() => expect(detailCalls).toBe(1));
    // First cycle schedules only when visible; start ran while hidden after first cycle.
    // Force hidden mid-flight schedule clear:
    hidden = true;
    scheduler.timeouts.length = 0;

    hidden = false;
    visibilityHandler?.();
    await vi.waitFor(() => expect(detailCalls).toBe(2));
    poll.stop();
  });
});
