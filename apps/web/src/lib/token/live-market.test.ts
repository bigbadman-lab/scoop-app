import { describe, expect, it } from 'vitest';
import type { TokenDetail, TradeItem } from '@scoop/db';
import { helloTradesNewestFirst } from '@/lib/token/hello-trades.fixture';
import {
  PRICE_CHART_ROLLING_TRADE_CAP,
  applyLiveTradePoll,
  liveTokenFingerprint,
  mergeLiveToken,
  recentTradesFromLiveWindow,
  shouldReseedFromTradeHead,
  tradesFingerprint,
  trimRollingTradesChronological,
} from '@/lib/token/live-market';
import { sortTradesChronological, tradeIdentity } from '@/lib/token/trade-series';

function cloneTrade(
  base: TradeItem,
  overrides: Partial<TradeItem> & { logIndex: number; blockTimestamp: number; txHash: string },
): TradeItem {
  return { ...base, ...overrides };
}

describe('live-market helpers', () => {
  it('fingerprints live token fields and skips churn when unchanged', () => {
    const a = {
      priceUsdX18: '1',
      priceQuoteX18: '2',
      fdvUsdX18: '3',
      volume24hUsdX18: null,
      volume24hQuoteRaw: '4',
      holderCountRetail: 2,
      holderCountAll: 3,
      launchProgressBps: 100,
      launchComplete: false,
      priceChange24hBps: -10,
      lastTradeAt: 99,
      creatorFeesLifetimeEthRaw: null,
      buybackFeesLifetimeEthRaw: null,
      priceUsdDisplay: '0.1',
      priceQuoteDisplay: '0.2',
      fdvUsdDisplay: '3',
      volume24hUsdDisplay: null,
      volume24hQuoteDisplay: '4',
      tradeCount24h: 1,
      tradeCountAllTime: null,
    buyCount24h: null,
    sellCount24h: null,
    } as TokenDetail;
    const b = { ...a };
    expect(liveTokenFingerprint(a)).toBe(liveTokenFingerprint(b));
    expect(mergeLiveToken(a, b).changed).toBe(false);
    expect(mergeLiveToken(a, b).token).toBe(a);

    const c = { ...a, priceUsdX18: '9', fdvUsdX18: '27' };
    const merged = mergeLiveToken(a, c);
    expect(merged.changed).toBe(true);
    expect(merged.token.priceUsdX18).toBe('9');
    expect(merged.token.fdvUsdX18).toBe('27');
  });

  it('dedupes and appends multiple unseen trades in chronological order', () => {
    const seed = sortTradesChronological(helloTradesNewestFirst());
    const newest = seed[seed.length - 1]!;
    const extra = [
      cloneTrade(newest, {
        logIndex: 9001,
        blockTimestamp: newest.blockTimestamp + 10,
        txHash: `0x${'ab'.repeat(32)}`,
      }),
      cloneTrade(newest, {
        logIndex: 9002,
        blockTimestamp: newest.blockTimestamp + 20,
        txHash: `0x${'cd'.repeat(32)}`,
      }),
    ];

    const first = applyLiveTradePoll({
      existingChronoAsc: seed,
      incomingNewestFirst: [...extra].reverse(),
    });
    expect(first.apply).toBe('append');
    expect(first.appended).toHaveLength(2);
    expect(first.tradesChronoAsc).toHaveLength(seed.length + 2);
    expect(tradeIdentity(first.tradesChronoAsc.at(-1)!)).toBe(tradeIdentity(extra[1]!));

    // Duplicate poll is unchanged.
    const second = applyLiveTradePoll({
      existingChronoAsc: first.tradesChronoAsc,
      incomingNewestFirst: [...extra, ...helloTradesNewestFirst()],
    });
    expect(second.apply).toBe('unchanged');
    expect(tradesFingerprint(second.tradesChronoAsc)).toBe(
      tradesFingerprint(first.tradesChronoAsc),
    );
  });

  it('reseeds when trade head is missing from an overlapping poll window', () => {
    const seed = sortTradesChronological(helloTradesNewestFirst());
    const withoutNewest = seed.slice(0, -1);
    expect(
      shouldReseedFromTradeHead(seed, [...withoutNewest].reverse()),
    ).toBe(true);

    const result = applyLiveTradePoll({
      existingChronoAsc: seed,
      incomingNewestFirst: [...withoutNewest].reverse(),
    });
    expect(result.apply).toBe('reseed');
    expect(result.tradesChronoAsc).toHaveLength(withoutNewest.length);
  });

  it('bounds rolling PRICE window and Recent Trades visible list', () => {
    const base = helloTradesNewestFirst()[0]!;
    const many: TradeItem[] = [];
    for (let i = 0; i < 250; i += 1) {
      many.push(
        cloneTrade(base, {
          logIndex: i,
          blockTimestamp: 1_700_000_000 + i,
          txHash: `0x${i.toString(16).padStart(64, 'a')}`,
        }),
      );
    }

    const trimmed = trimRollingTradesChronological(many, PRICE_CHART_ROLLING_TRADE_CAP);
    expect(trimmed).toHaveLength(PRICE_CHART_ROLLING_TRADE_CAP);
    expect(trimmed[0]!.logIndex).toBe(50);
    expect(trimmed.at(-1)!.logIndex).toBe(249);

    // 100 seed + 50 new across polls stays deduped and capped for recent list.
    let window = many.slice(0, 100);
    for (let batch = 0; batch < 5; batch += 1) {
      const start = 100 + batch * 10;
      const incoming = many.slice(start, start + 10).reverse();
      const applied = applyLiveTradePoll({
        existingChronoAsc: window,
        incomingNewestFirst: incoming,
      });
      window = applied.tradesChronoAsc;
    }
    expect(window).toHaveLength(150);
    const recent = recentTradesFromLiveWindow(window);
    expect(recent).toHaveLength(20);
    expect(recent[0]!.logIndex).toBe(149);
    expect(new Set(recent.map((t) => tradeIdentity(t))).size).toBe(20);
  });
});
