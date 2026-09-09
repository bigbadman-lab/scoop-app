import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { TradeItem } from '@scoop/db';
import { clearTradeCache } from '@/lib/token/fetch-trades';

const setData = vi.fn();
const createPriceLine = vi.fn(() => ({ remove: vi.fn() }));
const removePriceLine = vi.fn();
const priceScaleApply = vi.fn();
const addSeries = vi.fn(() => ({
  setData,
  createPriceLine,
  removePriceLine,
  priceScale: () => ({ applyOptions: priceScaleApply }),
}));
const setVisibleLogicalRange = vi.fn();
const addPane = vi.fn();
const setHeight = vi.fn();
const subscribeCrosshairMove = vi.fn();
const unsubscribeCrosshairMove = vi.fn();

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries,
    addPane,
    panes: () => [{}, { setHeight }],
    timeScale: () => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange,
    }),
    subscribeCrosshairMove,
    unsubscribeCrosshairMove,
    remove: vi.fn(),
  })),
  CandlestickSeries: { __type: 'CandlestickSeries' },
  HistogramSeries: { __type: 'HistogramSeries' },
  ColorType: { Solid: 0 },
  LineStyle: { Dashed: 2, SparseDotted: 4 },
}));

import { CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { TokenPriceChart } from '@/components/token/TokenPriceChart';

const HELLO_SUPPLY = '1000000000000000000000000000'; // 1B * 1e18

function tradeItem(
  partial: Partial<TradeItem> & {
    logIndex: number;
    blockTimestamp: number;
    executionPriceUsdX18: string;
  },
): TradeItem {
  return {
    chainId: 4663,
    txHash: `0x${partial.logIndex.toString(16).padStart(64, 'a')}`,
    blockNumber: partial.blockTimestamp,
    tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    poolId: '0xpool',
    side: 'buy',
    swapSender: '0x1',
    txFrom: '0x1',
    traderAddress: '0x1',
    traderAttributionType: 'tx_from',
    quoteAmountRaw: '1000000000000000000',
    quoteAmountDisplay: '1',
    tokenAmountRaw: '1000000000000000000',
    tokenAmountDisplay: '1',
    executionPriceQuoteX18: partial.executionPriceUsdX18,
    executionPriceQuoteDisplay: '0',
    quoteUsdX18: '1000000000000000000',
    executionPriceUsdDisplay: '0',
    usdValueX18: '1000000000000000000',
    usdValueDisplay: '1',
    isInitialBuy: false,
    confirmationStatus: 'finalized',
    ...partial,
  };
}

describe('TokenPriceChart PRICE MVP', () => {
  beforeEach(() => {
    clearTradeCache();
    setData.mockClear();
    addSeries.mockClear();
    createPriceLine.mockClear();
    setVisibleLogicalRange.mockClear();
    addPane.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders PRICE label without timeframe selector and HELLO green/red path', async () => {
    const trades = [
      tradeItem({ logIndex: 7, blockTimestamp: 70, side: 'sell', executionPriceUsdX18: '4980' }),
      tradeItem({ logIndex: 6, blockTimestamp: 60, side: 'buy', executionPriceUsdX18: '5092' }),
      tradeItem({ logIndex: 5, blockTimestamp: 50, side: 'sell', executionPriceUsdX18: '5118' }),
      tradeItem({ logIndex: 4, blockTimestamp: 40, side: 'buy', executionPriceUsdX18: '5231' }),
      tradeItem({ logIndex: 3, blockTimestamp: 30, side: 'sell', executionPriceUsdX18: '5003' }),
      tradeItem({ logIndex: 2, blockTimestamp: 20, side: 'buy', executionPriceUsdX18: '5104' }),
      tradeItem({ logIndex: 1, blockTimestamp: 10, side: 'buy', executionPriceUsdX18: '5079' }),
    ];
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: trades }));

    render(
      <TokenPriceChart
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        symbol="HELLO"
        quoteSymbol="ETH"
        totalSupplyRaw={HELLO_SUPPLY}
        tokenDecimals={18}
        currentPriceUsdX18="4980847824978"
      />,
    );

    expect(screen.getByTestId('token-chart-title').textContent).toMatch(/Price/i);
    expect(screen.queryByTestId('token-chart-range-selector')).toBeNull();
    expect(screen.queryByTestId('token-chart-interval-trades')).toBeNull();
    expect(screen.queryByTestId('token-chart-interval-5s')).toBeNull();

    await waitFor(() => expect(screen.getByTestId('token-chart-basis').textContent).toMatch(/USD/));
    expect(screen.getByTestId('token-chart-canvas').getAttribute('data-chart-mode')).toBe('price');
    expect(addSeries.mock.calls[0]![0]).toBe(CandlestickSeries);
    expect(addSeries.mock.calls.some((c) => c[0] === HistogramSeries)).toBe(true);
    expect(createPriceLine).toHaveBeenCalled();

    const candleData = setData.mock.calls[0]![0] as Array<{ open: number; close: number }>;
    expect(candleData).toHaveLength(6);
    expect(candleData.map((c) => (c.close >= c.open ? 'GREEN' : 'RED'))).toEqual([
      'GREEN',
      'RED',
      'GREEN',
      'RED',
      'RED',
      'RED',
    ]);
  });

  it('shows empty and single-trade states', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [] }));
    const { rerender } = render(
      <TokenPriceChart
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        symbol="HELLO"
        quoteSymbol="ETH"
        totalSupplyRaw={HELLO_SUPPLY}
        tokenDecimals={18}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('token-chart-empty').textContent).toMatch(/No trade history/i),
    );

    clearTradeCache();
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        items: [tradeItem({ logIndex: 1, blockTimestamp: 10, executionPriceUsdX18: '1000' })],
      }),
    );
    rerender(
      <TokenPriceChart
        tokenAddress="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        symbol="X"
        quoteSymbol="ETH"
        totalSupplyRaw={HELLO_SUPPLY}
        tokenDecimals={18}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('token-chart-empty').textContent).toMatch(/1 trade recorded/i),
    );
  });
});
