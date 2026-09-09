import { describe, expect, it } from 'vitest';
import type { TradeItem } from '@scoop/db';
import { fdvUsdX18FromPrice } from '@scoop/shared';
import { activityVisibleLogicalRange } from '@/lib/token/chart-series';
import {
  buildTradeMovementSeries,
  fdvAtExecutionUsd,
  formatTradeMovementTooltip,
  mergeTradesByIdentity,
  selectTradeChartBasis,
  sortTradesChronological,
  tradeBarsToVolume,
  tradeIdentity,
} from '@/lib/token/trade-series';

const HELLO_SUPPLY = '1000000000000000000000000000';

function trade(partial: Partial<TradeItem> & { logIndex: number; blockTimestamp: number }): TradeItem {
  return {
    chainId: 4663,
    txHash: `0x${partial.logIndex.toString(16).padStart(64, '0')}`,
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
    executionPriceQuoteX18: '1000',
    executionPriceQuoteDisplay: '0.000000000000001',
    quoteUsdX18: '2000000000000000000000',
    executionPriceUsdX18: '2000',
    executionPriceUsdDisplay: '0.000000000000002',
    usdValueX18: '1000000000000000000',
    usdValueDisplay: '1',
    isInitialBuy: false,
    confirmationStatus: 'finalized',
    ...partial,
  };
}

function x18(n: bigint): number {
  return Number(n) / 1e18;
}

describe('trade-derived PRICE bars', () => {
  it('builds HELLO-like green/red sequence with exact OHLC mapping', () => {
    const p = (n: bigint) => n.toString();
    const newestFirst = [
      trade({ logIndex: 7, blockTimestamp: 70, side: 'sell', executionPriceUsdX18: p(4980n), usdValueX18: '7' }),
      trade({ logIndex: 6, blockTimestamp: 60, side: 'buy', executionPriceUsdX18: p(5092n), usdValueX18: '6' }),
      trade({ logIndex: 5, blockTimestamp: 50, side: 'sell', executionPriceUsdX18: p(5118n), usdValueX18: '5' }),
      trade({ logIndex: 4, blockTimestamp: 40, side: 'buy', executionPriceUsdX18: p(5231n), usdValueX18: '4' }),
      trade({ logIndex: 3, blockTimestamp: 30, side: 'sell', executionPriceUsdX18: p(5003n), usdValueX18: '3' }),
      trade({ logIndex: 2, blockTimestamp: 20, side: 'buy', executionPriceUsdX18: p(5104n), usdValueX18: '2' }),
      trade({ logIndex: 1, blockTimestamp: 10, side: 'buy', executionPriceUsdX18: p(5079n), usdValueX18: '1' }),
    ];

    const series = buildTradeMovementSeries(newestFirst, {
      totalSupplyRaw: HELLO_SUPPLY,
      tokenDecimals: 18,
    });
    expect(series.basis).toBe('usd');
    expect(series.bars).toHaveLength(6);
    expect(series.bars.map((b) => (b.up ? 'GREEN' : 'RED'))).toEqual([
      'GREEN',
      'RED',
      'GREEN',
      'RED',
      'RED',
      'RED',
    ]);
    expect(series.bars[0]!.open).toBe(x18(5079n));
    expect(series.bars[0]!.close).toBe(x18(5104n));
    expect(series.bars[4]!.side).toBe('buy');
    expect(series.bars[4]!.up).toBe(false);
  });

  it('attaches execution-specific FDV via shared fdvUsdX18FromPrice (not current FDV)', () => {
    const low = '5000000000000'; // $5e-6
    const high = '6000000000000';
    const series = buildTradeMovementSeries(
      [
        trade({
          logIndex: 2,
          blockTimestamp: 20,
          side: 'buy',
          executionPriceUsdX18: high,
          executionPriceUsdDisplay: '0.000006',
          usdValueDisplay: '10',
        }),
        trade({
          logIndex: 1,
          blockTimestamp: 10,
          side: 'sell',
          executionPriceUsdX18: low,
          executionPriceUsdDisplay: '0.000005',
        }),
      ],
      { totalSupplyRaw: HELLO_SUPPLY, tokenDecimals: 18 },
    );
    expect(series.bars).toHaveLength(1);
    const bar = series.bars[0]!;
    const expected = fdvUsdX18FromPrice({
      priceUsdX18: BigInt(high),
      totalSupplyRaw: BigInt(HELLO_SUPPLY),
      tokenDecimals: 18,
    });
    expect(bar.fdvUsdX18).toBe(expected.toString());
    expect(bar.fdvDisplay).toMatch(/^\$/);
    // Different execution → different FDV
    const other = fdvAtExecutionUsd({
      executionPriceUsdX18: low,
      totalSupplyRaw: HELLO_SUPPLY,
      tokenDecimals: 18,
    });
    expect(other!.fdvUsdX18).not.toBe(bar.fdvUsdX18);

    const tip = formatTradeMovementTooltip(bar, 'usd', 'ETH');
    expect(tip).toMatch(/^BUY/);
    expect(tip).toMatch(/Price/);
    expect(tip).toMatch(/FDV/);
    expect(tip).toMatch(/Trade/);
  });

  it('omits FDV in quote mode', () => {
    const series = buildTradeMovementSeries(
      [
        trade({
          logIndex: 2,
          blockTimestamp: 20,
          executionPriceUsdX18: null,
          executionPriceQuoteX18: '2000',
        }),
        trade({
          logIndex: 1,
          blockTimestamp: 10,
          executionPriceUsdX18: '1000',
          executionPriceQuoteX18: '1000',
        }),
      ],
      { totalSupplyRaw: HELLO_SUPPLY, tokenDecimals: 18 },
    );
    expect(selectTradeChartBasis(series.trades)).toBe('quote');
    expect(series.bars[0]!.fdvDisplay).toBeNull();
  });

  it('returns empty bars for 0 or 1 trade', () => {
    expect(buildTradeMovementSeries([]).bars).toHaveLength(0);
    expect(
      buildTradeMovementSeries([
        trade({ logIndex: 1, blockTimestamp: 10, executionPriceUsdX18: '1000' }),
      ]).bars,
    ).toHaveLength(0);
  });

  it('maps one volume bar per movement bar', () => {
    const series = buildTradeMovementSeries([
      trade({
        logIndex: 2,
        blockTimestamp: 20,
        executionPriceUsdX18: '2000',
        usdValueX18: '5000000000000000000',
      }),
      trade({
        logIndex: 1,
        blockTimestamp: 10,
        executionPriceUsdX18: '1000',
        usdValueX18: '1000000000000000000',
      }),
    ]);
    const vol = tradeBarsToVolume(series.bars);
    expect(vol).toHaveLength(1);
    expect(vol[0]!.time).toBe(series.bars[0]!.time);
    expect(vol[0]!.value).toBe(5);
  });

  it('handles a dense newest-first 100-trade fixture deterministically', () => {
    const newestFirst: TradeItem[] = [];
    for (let i = 100; i >= 1; i -= 1) {
      newestFirst.push(
        trade({
          logIndex: i,
          blockTimestamp: 1_700_000_000 + i,
          side: i % 2 === 0 ? 'buy' : 'sell',
          executionPriceUsdX18: String(1_000_000 + i * 1000),
          txHash: `0x${i.toString(16).padStart(64, 'b')}`,
          usdValueX18: '1000000000000000000',
        }),
      );
    }
    expect(newestFirst).toHaveLength(100);
    const series = buildTradeMovementSeries(newestFirst, {
      totalSupplyRaw: HELLO_SUPPLY,
      tokenDecimals: 18,
    });
    expect(series.trades).toHaveLength(100);
    expect(series.bars).toHaveLength(99);
    const ids = new Set(series.bars.map((b) => b.tradeId));
    expect(ids.size).toBe(99);
    expect(tradeBarsToVolume(series.bars).length).toBe(99);

    const chrono = sortTradesChronological(newestFirst);
    expect(chrono[0]!.logIndex).toBe(1);
    expect(chrono[99]!.logIndex).toBe(100);

    // Dense viewport: relative padding smaller than sparse 4-bar case
    const dense = activityVisibleLogicalRange(99, {
      containerWidthPx: 720,
      maxBarSpacing: 28,
    });
    const sparse = activityVisibleLogicalRange(4, {
      containerWidthPx: 720,
      maxBarSpacing: 28,
    });
    const denseRel = (1 - dense.from + (dense.to - 99)) / 99;
    const sparseRel = (1 - sparse.from + (sparse.to - 4)) / 4;
    expect(denseRel).toBeLessThan(sparseRel);

    // Deterministic rebuild
    const again = buildTradeMovementSeries(newestFirst, {
      totalSupplyRaw: HELLO_SUPPLY,
      tokenDecimals: 18,
    });
    expect(again.bars.map((b) => b.tradeId)).toEqual(series.bars.map((b) => b.tradeId));
    expect(again.bars.map((b) => b.close)).toEqual(series.bars.map((b) => b.close));
  });

  it('dedupes by chainId+txHash+logIndex for future live merge', () => {
    const a = trade({ logIndex: 1, blockTimestamp: 10, txHash: `0x${'a'.repeat(64)}` });
    const b = trade({
      logIndex: 1,
      blockTimestamp: 10,
      txHash: `0x${'a'.repeat(64)}`,
      side: 'sell',
    });
    const c = trade({ logIndex: 2, blockTimestamp: 20, txHash: `0x${'b'.repeat(64)}` });
    expect(tradeIdentity(a)).toBe(tradeIdentity(b));
    const merged = mergeTradesByIdentity([a], [b, c]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.side).toBe('sell');
  });
});
