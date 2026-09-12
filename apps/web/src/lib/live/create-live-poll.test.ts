import { describe, expect, it, vi } from 'vitest';
import { createLivePoll } from '@/lib/live/create-live-poll';
import { MARKETS_LIVE_POLL_MS } from '@/lib/markets/constants';
import type { MarketsBoardSnapshot } from '@/lib/markets/types';

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

function board(
  items: MarketsBoardSnapshot['items'],
  status: MarketsBoardSnapshot['status'] = 'ok',
): MarketsBoardSnapshot {
  return {
    status: items.length === 0 && status === 'ok' ? 'empty' : status,
    items,
    updatedAt: Date.now(),
  };
}

function item(
  address: string,
  fdvUsdX18: string | null,
  overrides: Partial<MarketsBoardSnapshot['items'][number]> = {},
): MarketsBoardSnapshot['items'][number] {
  return {
    tokenAddress: address,
    name: overrides.name ?? address.slice(0, 8),
    symbol: overrides.symbol ?? 'TKN',
    imageUri: '',
    displayImageUrl: null,
    quoteAsset: '0x0000000000000000000000000000000000000000',
    quoteSymbol: 'ETH',
    quoteImageUrl: null,
    launchedAt: 1_700_000_000,
    ageSeconds: 100,
    fdvUsdX18,
    fdvUsdDisplay: fdvUsdX18,
    tradeCountAllTime: null,
    tradeCount24h: null,
    holderCountAll: null,
    holderCountRetail: null,
    ...overrides,
  };
}

describe('createLivePoll (markets)', () => {
  it('polls after completion, never overlaps, and pauses while hidden', async () => {
    const scheduler = createScheduler();
    let hidden = false;
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const snapshots: MarketsBoardSnapshot[] = [];

    const initial = board([item('0xaaa', '10')]);

    const poll = createLivePoll({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial,
      isDocumentHidden: () => hidden,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => {},
      fetchSnapshot: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        calls += 1;
        await Promise.resolve();
        inFlight -= 1;
        return board([item('0xaaa', String(10 + calls))]);
      },
      onSnapshot: (s) => snapshots.push(s),
    });

    poll.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(scheduler.timeouts).toHaveLength(1);
    expect(scheduler.timeouts[0]!.ms).toBe(MARKETS_LIVE_POLL_MS);

    await scheduler.flushOne();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(maxInFlight).toBe(1);

    hidden = true;
    await scheduler.flushOne();
    await Promise.resolve();
    await Promise.resolve();
    // Cycle may run if already scheduled; after completion while hidden, no next timer.
    expect(scheduler.timeouts).toHaveLength(0);

    poll.stop();
  });

  it('keeps prior snapshot on failed refresh and replaces on success', async () => {
    const scheduler = createScheduler();
    const snapshots: MarketsBoardSnapshot[] = [];
    let mode: 'ok' | 'fail' | 'reorder' = 'ok';

    const initial = board([
      item('0xhigh', '100', { symbol: 'HIGH' }),
      item('0xlow', '10', { symbol: 'LOW' }),
    ]);

    const poll = createLivePoll({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial,
      isDocumentHidden: () => false,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => {},
      fetchSnapshot: async () => {
        if (mode === 'fail') return null;
        if (mode === 'reorder') {
          return board([
            item('0xlow', '500', { symbol: 'LOW' }),
            item('0xhigh', '100', { symbol: 'HIGH' }),
            item('0xnew', '50', { symbol: 'NEW' }),
          ]);
        }
        return board([
          item('0xhigh', '200', { symbol: 'HIGH' }),
          item('0xlow', '10', { symbol: 'LOW' }),
        ]);
      },
      onSnapshot: (s) => snapshots.push(s),
    });

    poll.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)!.items[0]!.fdvUsdX18).toBe('200');

    mode = 'fail';
    await scheduler.flushOne();
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)!.items[0]!.fdvUsdX18).toBe('200');
    expect(poll.getSnapshot().items[0]!.fdvUsdX18).toBe('200');

    mode = 'reorder';
    await scheduler.flushOne();
    await Promise.resolve();
    await Promise.resolve();
    const next = snapshots.at(-1)!;
    expect(next.items.map((i) => i.symbol)).toEqual(['LOW', 'HIGH', 'NEW']);
    expect(new Set(next.items.map((i) => i.tokenAddress)).size).toBe(3);

    poll.stop();
  });

  it('refreshes immediately when visibility restores', async () => {
    const scheduler = createScheduler();
    let hidden = true;
    let visibilityListener: (() => void) | null = null;
    let calls = 0;

    const poll = createLivePoll({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial: board([item('0xaaa', '1')]),
      isDocumentHidden: () => hidden,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: (listener) => {
        visibilityListener = listener;
        return () => {
          visibilityListener = null;
        };
      },
      fetchSnapshot: async () => {
        calls += 1;
        return board([item('0xaaa', String(calls))]);
      },
      onSnapshot: () => {},
    });

    poll.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    // Hidden after start → no scheduled timer from first cycle's finally.
    expect(scheduler.timeouts).toHaveLength(0);

    hidden = false;
    visibilityListener?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);

    poll.stop();
  });

  it('drops inactive markets and avoids duplicate rows across refreshes', async () => {
    const scheduler = createScheduler();
    const snapshots: MarketsBoardSnapshot[] = [];
    let generation = 0;

    const poll = createLivePoll({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial: board([
        item('0xa', '3'),
        item('0xb', '2'),
        item('0xc', '1'),
      ]),
      isDocumentHidden: () => false,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      addVisibilityListener: () => () => {},
      fetchSnapshot: async () => {
        generation += 1;
        if (generation === 1) {
          return board([item('0xa', '3'), item('0xb', '2'), item('0xc', '1')]);
        }
        // Real `/api/markets` path dedupes via rankMarketsByFdv before emit.
        return board([item('0xb', '9')]);
      },
      onSnapshot: (s) => snapshots.push(s),
    });

    poll.start();
    await Promise.resolve();
    await Promise.resolve();
    await scheduler.flushOne();
    await Promise.resolve();
    await Promise.resolve();

    const last = snapshots.at(-1)!;
    expect(last.items.map((i) => i.tokenAddress)).toEqual(['0xb']);
    expect(last.items).toHaveLength(1);

    poll.stop();
  });
});

describe('fetchMarketsBoard', () => {
  it('returns null on HTTP failure so prior snapshot is retained by the poll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { fetchMarketsBoard } = await import('@/lib/markets/fetch-markets');
    await expect(fetchMarketsBoard()).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
