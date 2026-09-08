import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { CandleItem } from '@scoop/db';
import { clearCandleCache } from '@/lib/token/fetch-candles';

const setData = vi.fn();
const addSeries = vi.fn(() => ({ setData }));
const subscribeCrosshairMove = vi.fn();
const unsubscribeCrosshairMove = vi.fn();

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries,
    timeScale: () => ({ fitContent: vi.fn() }),
    subscribeCrosshairMove,
    unsubscribeCrosshairMove,
    remove: vi.fn(),
  })),
  CandlestickSeries: { __type: 'CandlestickSeries' },
  AreaSeries: { __type: 'AreaSeries' },
  ColorType: { Solid: 0 },
}));

import { createChart, CandlestickSeries, AreaSeries } from 'lightweight-charts';
import { TokenPriceChart } from '@/components/token/TokenPriceChart';

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

function usdCandle(bucketStart: number): CandleItem {
  return candle({
    bucketStart,
    openUsdX18: '5000000000000',
    highUsdX18: '5200000000000',
    lowUsdX18: '4900000000000',
    closeUsdX18: '5031748248108',
  });
}

describe('TokenPriceChart OHLC', () => {
  beforeEach(() => {
    clearCandleCache();
    setData.mockClear();
    addSeries.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to 5m, uses candlestick series, and prefers USD when OHLC complete', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('interval=5m')) {
        return Response.json({ items: [usdCandle(10), usdCandle(20)] });
      }
      return Response.json({
        items: [
          candle({ bucketStart: 1 }),
          candle({ bucketStart: 2, closeUsdX18: '5000000000000' }),
        ],
      });
    });

    render(
      <TokenPriceChart
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        symbol="HELLO"
        quoteSymbol="ETH"
      />,
    );

    expect(screen.getByTestId('token-chart-interval-5m').getAttribute('aria-selected')).toBe(
      'true',
    );

    await waitFor(() => expect(screen.getByTestId('token-chart-basis').textContent).toMatch(/USD/));
    expect(screen.getByTestId('token-chart-canvas').getAttribute('data-series')).toBe(
      'candlestick',
    );
    expect(addSeries).toHaveBeenCalled();
    expect(addSeries.mock.calls[0]![0]).toBe(CandlestickSeries);
    expect(addSeries.mock.calls[0]![0]).not.toBe(AreaSeries);
    expect(setData).toHaveBeenCalled();
    const data = setData.mock.calls[0]![0] as Array<{ open: number; high: number; low: number; close: number }>;
    expect(data[0]).toHaveProperty('open');
    expect(data[0]).toHaveProperty('high');
    expect(data[0]).toHaveProperty('low');
    expect(data[0]).toHaveProperty('close');
    expect(createChart).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('token-chart-interval-1m'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('token-chart-interval-1m').getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('token-chart-basis').textContent).toMatch(/ETH/));
    expect(screen.getByTestId('token-chart-summary').textContent).toMatch(/OHLC/i);
  });

  it('shows empty and error states', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [] }));
    const { rerender } = render(
      <TokenPriceChart
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        symbol="HELLO"
        quoteSymbol="ETH"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('token-chart-empty')).toBeTruthy());

    clearCandleCache();
    vi.mocked(fetch).mockResolvedValue(new Response('fail', { status: 500 }));
    rerender(
      <TokenPriceChart
        tokenAddress="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        symbol="X"
        quoteSymbol="ETH"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('token-chart-error')).toBeTruthy());
  });
});
