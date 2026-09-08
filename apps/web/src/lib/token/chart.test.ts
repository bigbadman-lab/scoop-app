import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CHART_INTERVAL,
  candleQueryForInterval,
  CHART_INTERVAL_CONFIG,
  CHART_INTERVALS,
} from '@/lib/token/chart-ranges';
import {
  candlesHaveCompleteUsd,
  candlesToOhlc,
  formatChartPrice,
  formatOhlcTooltip,
  selectChartBasis,
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
  it('defaults to 5m and exposes all candle intervals', () => {
    expect(DEFAULT_CHART_INTERVAL).toBe('5m');
    expect([...CHART_INTERVALS]).toEqual(['1m', '5m', '15m', '1h', '4h', '1d']);
  });

  it('maps bounded history windows under the 500-candle cap', () => {
    const now = 1_700_000_000;
    expect(candleQueryForInterval('1m', now)).toEqual({
      interval: '1m',
      from: now - 5 * 3600,
      limit: 300,
    });
    expect(candleQueryForInterval('5m', now)).toEqual({
      interval: '5m',
      from: now - 86_400,
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
});

describe('fetchTokenCandles intervals', () => {
  beforeEach(() => {
    clearCandleCache();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['1m', '5m', '15m', '1h', '4h', '1d'] as const)(
    'requests SCOOP candles for %s',
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
      expect(url).not.toMatch(/coingecko|dexscreener|tradingview/i);
      if (interval !== '1d') {
        expect(url).toContain('from=');
      }
    },
  );

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
