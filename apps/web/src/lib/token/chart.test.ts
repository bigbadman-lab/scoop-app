import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CHART_MODE,
  candleQueryForInterval,
  CHART_INTERVAL_CONFIG,
  CHART_INTERVALS,
  CHART_MODES,
} from '@/lib/token/chart-ranges';
import {
  activityClusterFraction,
  activityVisibleLogicalRange,
  alignVolumeToCandles,
  buildActivityCentricPlot,
  candlesHaveCompleteUsd,
  candlesToOhlc,
  candlesToVolume,
  formatChartPrice,
  formatOhlcTooltip,
  selectChartBasis,
  withWhitespaceGaps,
  x18ToChartNumber,
} from '@/lib/token/chart-series';
import { clearCandleCache, fetchTokenCandles } from '@/lib/token/fetch-candles';
import type { CandleItem } from '@scoop/db';

function candle(partial: Partial<CandleItem> & { bucketStart: number }): CandleItem {
  return {
    chainId: 4663,
    tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    poolId: '0xpool',
    interval: '5m',
    openQuoteX18: '2000000000',
    highQuoteX18: '2100000000',
    lowQuoteX18: '1900000000',
    closeQuoteX18: '2031177705',
    openQuoteDisplay: '0.000000002',
    highQuoteDisplay: '0.0000000021',
    lowQuoteDisplay: '0.0000000019',
    closeQuoteDisplay: '0.000000002031',
    quoteVolumeRaw: '1',
    tokenVolumeRaw: '1',
    tradeCount: 1,
    buyCount: 1,
    sellCount: 0,
    openUsdX18: null,
    highUsdX18: null,
    lowUsdX18: null,
    closeUsdX18: null,
    usdVolumeX18: null,
    ...partial,
  };
}

function usdComplete(bucketStart: number): CandleItem {
  return candle({
    bucketStart,
    openUsdX18: '5000000000000',
    highUsdX18: '5200000000000',
    lowUsdX18: '4900000000000',
    closeUsdX18: '5031748248108',
  });
}

describe('chart intervals', () => {
  it('keeps candle infrastructure (5s–1d) while MVP default mode remains trades/PRICE', () => {
    expect(DEFAULT_CHART_MODE).toBe('trades');
    expect([...CHART_INTERVALS]).toEqual(['5s', '1m', '5m', '15m', '1h', '4h', '1d']);
    expect([...CHART_MODES]).toEqual(['trades', '5s', '1m', '5m', '15m', '1h', '4h', '1d']);
  });

  it('maps bounded history windows under the 500-candle cap without wall-clock from', () => {
    const now = 1_700_000_000;
    expect(candleQueryForInterval('5s', now)).toEqual({
      interval: '5s',
      limit: 500,
    });
    expect(candleQueryForInterval('1m', now)).toEqual({
      interval: '1m',
      limit: 300,
    });
    expect(candleQueryForInterval('5m', now)).toEqual({
      interval: '5m',
      limit: 300,
    });
    expect(candleQueryForInterval('15m', now).interval).toBe('15m');
    expect(candleQueryForInterval('1h', now).interval).toBe('1h');
    expect(candleQueryForInterval('4h', now).interval).toBe('4h');
    expect(candleQueryForInterval('1d', now)).toEqual({
      interval: '1d',
      limit: 500,
    });
    for (const id of CHART_INTERVALS) {
      expect(CHART_INTERVAL_CONFIG[id].limit).toBeLessThanOrEqual(500);
      expect('from' in candleQueryForInterval(id, now)).toBe(false);
    }
  });
});

describe('USD-first OHLC adapter', () => {
  it('requires full USD OHLC for USD basis', () => {
    const complete = [usdComplete(1), usdComplete(2)];
    const closeOnly = [
      candle({ bucketStart: 1, closeUsdX18: '5031748248108' }),
      candle({ bucketStart: 2, closeUsdX18: '5100000000000' }),
    ];
    const partial = [usdComplete(1), candle({ bucketStart: 2, closeUsdX18: null })];
    expect(candlesHaveCompleteUsd(complete)).toBe(true);
    expect(selectChartBasis(complete)).toBe('usd');
    expect(candlesHaveCompleteUsd(closeOnly)).toBe(false);
    expect(selectChartBasis(closeOnly)).toBe('quote');
    expect(selectChartBasis(partial)).toBe('quote');
  });

  it('maps O/H/L/C ascending without mixing bases', () => {
    const items = [
      usdComplete(20),
      {
        ...usdComplete(10),
        openUsdX18: '4800000000000',
        highUsdX18: '5100000000000',
        lowUsdX18: '4700000000000',
        closeUsdX18: '5000000000000',
      },
    ];
    const usd = candlesToOhlc(items, 'usd');
    const quote = candlesToOhlc(items, 'quote');
    expect(usd.map((c) => c.time)).toEqual([10, 20]);
    expect(usd[0]).toMatchObject({
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
    });
    expect(usd[0]!.high).toBeGreaterThanOrEqual(usd[0]!.low);
    expect(usd[0]!.close).not.toBe(quote[0]!.close);
  });

  it('keeps tiny HELLO OHLC non-zero and formats tooltips', () => {
    const usd = x18ToChartNumber('5031748248108')!;
    const eth = x18ToChartNumber('2031177705')!;
    expect(usd).toBeGreaterThan(0);
    expect(eth).toBeGreaterThan(0);
    expect(formatChartPrice(usd, 'usd', 'ETH')).not.toBe('$0');
    expect(formatChartPrice(eth, 'quote', 'ETH')).not.toMatch(/^0 ETH$/);
    const tip = formatOhlcTooltip(
      { time: 1, open: usd, high: usd * 1.01, low: usd * 0.99, close: usd },
      'usd',
      'ETH',
    );
    expect(tip).toMatch(/^O  \$/);
    expect(tip).toMatch(/H  \$/);
    expect(tip).toMatch(/L  \$/);
    expect(tip).toMatch(/C  \$/);
  });

  it('preserves sparse candles without inventing bars', () => {
    expect(candlesToOhlc([candle({ bucketStart: 100 })], 'quote')).toHaveLength(1);
  });

  it('documents deprecated whitespace helper never invents OHLC', () => {
    const sparse = [
      { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: 1300, open: 1.5, high: 2.5, low: 1, close: 2 },
    ];
    const withGaps = withWhitespaceGaps(sparse, 60);
    const whitespace = withGaps.filter((d) => !('open' in d));
    expect(whitespace.length).toBeGreaterThan(0);
    for (const w of whitespace) {
      expect(w).toEqual({ time: (w as { time: number }).time });
    }
  });

  it('collapses large wall-clock gaps into sequential logical slots', () => {
    const candles = [
      { time: 1_000, open: 1, high: 2, low: 1, close: 1.5 },
      { time: 1_000 + 3 * 86_400, open: 1.5, high: 2, low: 1, close: 1.2 },
    ];
    const plot = buildActivityCentricPlot(candles, [
      { time: 1_000, value: 1, up: true },
      { time: 1_000 + 3 * 86_400, value: 2, up: false },
    ]);
    expect(plot.candles.map((c) => c.time)).toEqual([1, 2]);
    expect(plot.realTimeByPlot.get(2)! - plot.realTimeByPlot.get(1)!).toBe(3 * 86_400);
  });

  it('colors volume by OHLC direction (close vs open), not trade side', () => {
    const bullish = candlesToVolume(
      [
        candle({
          bucketStart: 1,
          openUsdX18: '100',
          highUsdX18: '120',
          lowUsdX18: '90',
          closeUsdX18: '110',
          usdVolumeX18: '1000000000000000000',
          buyCount: 0,
          sellCount: 5,
        }),
      ],
      'usd',
    );
    const bearish = candlesToVolume(
      [
        candle({
          bucketStart: 2,
          openUsdX18: '110',
          highUsdX18: '120',
          lowUsdX18: '90',
          closeUsdX18: '100',
          usdVolumeX18: '1000000000000000000',
          buyCount: 5,
          sellCount: 0,
        }),
      ],
      'usd',
    );
    expect(bullish[0]!.up).toBe(true);
    expect(bearish[0]!.up).toBe(false);
  });

  it('maps real volume preferring USD when basis is usd', () => {
    const items = [
      candle({
        bucketStart: 10,
        openUsdX18: '100',
        highUsdX18: '110',
        lowUsdX18: '90',
        closeUsdX18: '105',
        usdVolumeX18: '5000000000000000000',
        quoteVolumeRaw: '1000000000000000000',
      }),
    ];
    const usdVol = candlesToVolume(items, 'usd');
    expect(usdVol).toHaveLength(1);
    expect(usdVol[0]!.value).toBe(5);
    const quoteVol = candlesToVolume(items, 'quote');
    expect(quoteVol[0]!.value).toBe(1);
  });

  it('skips null volume without fabricating zeros', () => {
    const items = [
      candle({
        bucketStart: 10,
        openUsdX18: '100',
        highUsdX18: '110',
        lowUsdX18: '90',
        closeUsdX18: '105',
        usdVolumeX18: null,
        quoteVolumeRaw: '',
      }),
    ];
    expect(candlesToVolume(items, 'usd')).toHaveLength(0);
  });

  it('builds activity-centric plot with logical spacing and truthful real times', () => {
    const candles = [
      { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: 100_000, open: 1.5, high: 2.5, low: 1, close: 1.2 },
      { time: 100_060, open: 1.2, high: 1.3, low: 1.0, close: 1.1 },
    ];
    const volume = [
      { time: 1000, value: 10, up: true },
      { time: 100_000, value: 20, up: false },
      { time: 100_060, value: 5, up: false },
    ];
    const plot = buildActivityCentricPlot(candles, volume);
    expect(plot.candles.map((c) => c.time)).toEqual([1, 2, 3]);
    expect(plot.realTimeByPlot.get(1)).toBe(1000);
    expect(plot.realTimeByPlot.get(2)).toBe(100_000);
    expect(plot.realTimeByPlot.get(3)).toBe(100_060);
    expect(plot.volume.map((v) => v.time)).toEqual([1, 2, 3]);
    expect(plot.volume.map((v) => v.value)).toEqual([10, 20, 5]);
    // OHLC preserved; close < open → up false on candle 2
    expect(plot.candles[1]!.close).toBeLessThan(plot.candles[1]!.open);
    expect(plot.volume[1]!.up).toBe(false);
    expect(plot.candles[0]!.close).toBeGreaterThanOrEqual(plot.candles[0]!.open);
    expect(plot.volume[0]!.up).toBe(true);
  });

  it('aligns volume 1:1 to real candles and drops orphan volume', () => {
    const candles = [{ time: 10, open: 1, high: 2, low: 1, close: 2 }];
    const volume = [
      { time: 10, value: 3, up: true },
      { time: 99, value: 9, up: false },
    ];
    expect(alignVolumeToCandles(candles, volume)).toEqual([
      { time: 10, value: 3, up: true },
    ]);
  });

  it('pads sparse and dense activity viewports without spanning dead wall-clock time', () => {
    const width = 720;
    const maxBar = 28;

    const cases = [1, 3, 4, 5, 20, 100] as const;
    for (const n of cases) {
      const range = activityVisibleLogicalRange(n, {
        containerWidthPx: width,
        maxBarSpacing: maxBar,
      });
      // Activity (plot indices 1..n) stays inside the viewport
      expect(range.from).toBeLessThan(1);
      expect(range.to).toBeGreaterThan(n);
      // Symmetric padding around the cluster (centered, not edge-pinned)
      const leftPad = 1 - range.from;
      const rightPad = range.to - n;
      expect(Math.abs(leftPad - rightPad)).toBeLessThan(1e-9);
      expect(leftPad).toBeGreaterThanOrEqual(1);
      // Relative padding shrinks as series densifies
      const relativePad = (leftPad + rightPad) / n;
      if (n <= 5) {
        expect(relativePad).toBeGreaterThan(1);
      }
    }

    const sparse = activityVisibleLogicalRange(4, {
      containerWidthPx: width,
      maxBarSpacing: maxBar,
    });
    const denser = activityVisibleLogicalRange(20, {
      containerWidthPx: width,
      maxBarSpacing: maxBar,
    });
    const dense = activityVisibleLogicalRange(100, {
      containerWidthPx: width,
      maxBarSpacing: maxBar,
    });
    const sparseRel = (1 - sparse.from + (sparse.to - 4)) / 4;
    const denserRel = (1 - denser.from + (denser.to - 20)) / 20;
    const denseRel = (1 - dense.from + (dense.to - 100)) / 100;
    expect(sparseRel).toBeGreaterThan(denserRel);
    expect(denserRel).toBeGreaterThan(denseRel);

    // Cluster fraction guide decreases padding intent as n grows
    expect(activityClusterFraction(1)).toBeLessThan(activityClusterFraction(4));
    expect(activityClusterFraction(4)).toBeLessThan(activityClusterFraction(20));
    expect(activityClusterFraction(20)).toBeLessThan(activityClusterFraction(100));
  });
});

describe('fetchTokenCandles intervals', () => {
  beforeEach(() => {
    clearCandleCache();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['5s', '1m', '5m', '15m', '1h', '4h', '1d'] as const)(
    'requests SCOOP candles for %s without wall-clock from filter',
    async (interval) => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(Response.json({ items: [] }));
      const now = 1_700_086_400;
      await fetchTokenCandles({
        tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        interval,
        nowSec: now,
      });
      const url = String(fetchMock.mock.calls[0]![0]);
      expect(url).toContain(`/api/tokens/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373/candles?`);
      expect(url).toContain(`interval=${interval}`);
      expect(url).toContain('limit=');
      expect(url).not.toContain('from=');
      expect(url).not.toMatch(/coingecko|dexscreener|tradingview/i);
    },
  );

  it('returns older historical candles when they exist outside a recent wall-clock window', async () => {
    const fetchMock = vi.mocked(fetch);
    const historical = [
      candle({
        bucketStart: 1_700_000_000,
        openUsdX18: '1',
        highUsdX18: '2',
        lowUsdX18: '1',
        closeUsdX18: '2',
        usdVolumeX18: '1000000000000000000',
      }),
    ];
    fetchMock.mockResolvedValue(Response.json({ items: historical }));
    // now is days after the candle — previously a from= window would have excluded it
    const result = await fetchTokenCandles({
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      interval: '1m',
      nowSec: 1_700_000_000 + 3 * 86_400,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.bucketStart).toBe(1_700_000_000);
    }
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('interval=1m');
    expect(url).not.toContain('from=');
  });

  it('caches identical interval fetches within the same minute', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(Response.json({ items: [] }));
    const args = {
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      interval: '5m' as const,
      nowSec: 1_700_000_030,
    };
    await fetchTokenCandles(args);
    await fetchTokenCandles(args);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
