import type { TradeItem } from '@scoop/db';
import { fdvUsdX18FromPrice } from '@scoop/shared';
import { formatCompactUsdMarketValue } from '@/lib/format';
import {
  type ChartBasis,
  type ChartCandle,
  type ChartVolumeBar,
  formatChartPrice,
  x18ToChartNumber,
} from '@/lib/token/chart-series';

/** Stable trade identity for seed/dedupe/live append. */
export function tradeIdentity(t: {
  chainId: number;
  txHash: string;
  logIndex: number;
}): string {
  return `${t.chainId}:${t.txHash.toLowerCase()}:${t.logIndex}`;
}

/** Newest-first API → chronological ASC by (timestamp, logIndex). */
export function sortTradesChronological<T extends { blockTimestamp: number; logIndex: number }>(
  trades: readonly T[],
): T[] {
  return [...trades].sort(
    (a, b) => a.blockTimestamp - b.blockTimestamp || a.logIndex - b.logIndex,
  );
}

/** USD-first only when every trade in the seed has execution USD. Never mix. */
export function selectTradeChartBasis(trades: readonly TradeItem[]): ChartBasis {
  if (trades.length === 0) return 'quote';
  const allUsd = trades.every(
    (t) => t.executionPriceUsdX18 != null && t.executionPriceUsdX18 !== '',
  );
  return allUsd ? 'usd' : 'quote';
}

export type TradeFdvContext = {
  /** Indexed token total supply (raw). */
  totalSupplyRaw: string;
  tokenDecimals: number;
};

/**
 * Historical FDV at an indexed execution USD price using the shared canonical formula
 * (`fdvUsdX18FromPrice` in @scoop/shared — same as indexer). Never uses current spot.
 */
export function fdvAtExecutionUsd(args: {
  executionPriceUsdX18: string;
  totalSupplyRaw: string;
  tokenDecimals: number;
}): { fdvUsdX18: string; fdvDisplay: string } | null {
  try {
    const price = BigInt(args.executionPriceUsdX18);
    const supply = BigInt(args.totalSupplyRaw);
    if (price < BigInt(0) || supply < BigInt(0)) return null;
    const fdvUsdX18 = fdvUsdX18FromPrice({
      priceUsdX18: price,
      totalSupplyRaw: supply,
      tokenDecimals: args.tokenDecimals,
    });
    const asNumber = x18ToChartNumber(fdvUsdX18.toString());
    if (asNumber == null || !Number.isFinite(asNumber)) return null;
    const fdvDisplay = formatCompactUsdMarketValue(asNumber);
    if (!fdvDisplay) return null;
    return { fdvUsdX18: fdvUsdX18.toString(), fdvDisplay };
  } catch {
    return null;
  }
}

export type TradeMovementBar = {
  /** Stable id of the closing trade (trade N). */
  tradeId: string;
  /** Real execution timestamp of trade N (unix sec). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  up: boolean;
  side: string;
  volume: number | null;
  tokenAmountDisplay: string;
  quoteAmountDisplay: string;
  usdValueDisplay: string | null;
  /** Close (trade N) execution price for display. */
  executionPriceDisplay: string;
  /** Historical FDV at trade N execution USD price (null in quote mode / missing inputs). */
  fdvUsdX18: string | null;
  fdvDisplay: string | null;
};

export type TradeMovementSeries = {
  basis: ChartBasis;
  /** Chronological trades used (after sort). */
  trades: TradeItem[];
  /** Trade 1 anchor price (chart number), if at least one trade exists. */
  anchorPrice: number | null;
  anchorTrade: TradeItem | null;
  /** Movement bars for trades 2..N (empty if < 2 trades). */
  bars: TradeMovementBar[];
};

function priceRaw(t: TradeItem, basis: ChartBasis): string | null {
  if (basis === 'usd') {
    return t.executionPriceUsdX18 != null && t.executionPriceUsdX18 !== ''
      ? t.executionPriceUsdX18
      : null;
  }
  return t.executionPriceQuoteX18;
}

function volumeForTrade(t: TradeItem, basis: ChartBasis): number | null {
  if (basis === 'usd') {
    return x18ToChartNumber(t.usdValueX18);
  }
  return x18ToChartNumber(t.quoteAmountRaw);
}

/**
 * Build trade-derived movement bars from a trades API response (newest-first OK).
 * Trade 1 = anchor only; bars start at trade 2.
 * Pure — safe for full rebuild or future incremental append after merge+sort+dedupe.
 */
export function buildTradeMovementSeries(
  tradesNewestFirst: readonly TradeItem[],
  fdvContext?: TradeFdvContext | null,
): TradeMovementSeries {
  const trades = sortTradesChronological(tradesNewestFirst);
  const basis = selectTradeChartBasis(trades);
  if (trades.length === 0) {
    return { basis, trades, anchorPrice: null, anchorTrade: null, bars: [] };
  }

  const anchorTrade = trades[0]!;
  const anchorPrice = x18ToChartNumber(priceRaw(anchorTrade, basis));
  const bars: TradeMovementBar[] = [];

  for (let i = 1; i < trades.length; i += 1) {
    const prev = trades[i - 1]!;
    const cur = trades[i]!;
    const open = x18ToChartNumber(priceRaw(prev, basis));
    const close = x18ToChartNumber(priceRaw(cur, basis));
    if (open == null || close == null || !Number.isFinite(open) || !Number.isFinite(close)) {
      continue;
    }
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    const up = close >= open;

    let fdvUsdX18: string | null = null;
    let fdvDisplay: string | null = null;
    if (
      basis === 'usd' &&
      fdvContext &&
      cur.executionPriceUsdX18 != null &&
      cur.executionPriceUsdX18 !== ''
    ) {
      const fdv = fdvAtExecutionUsd({
        executionPriceUsdX18: cur.executionPriceUsdX18,
        totalSupplyRaw: fdvContext.totalSupplyRaw,
        tokenDecimals: fdvContext.tokenDecimals,
      });
      if (fdv) {
        fdvUsdX18 = fdv.fdvUsdX18;
        fdvDisplay = fdv.fdvDisplay;
      }
    }

    bars.push({
      tradeId: tradeIdentity(cur),
      time: cur.blockTimestamp,
      open,
      high,
      low,
      close,
      up,
      side: String(cur.side),
      volume: volumeForTrade(cur, basis),
      tokenAmountDisplay: cur.tokenAmountDisplay,
      quoteAmountDisplay: cur.quoteAmountDisplay,
      usdValueDisplay: cur.usdValueDisplay,
      executionPriceDisplay:
        basis === 'usd'
          ? (cur.executionPriceUsdDisplay ?? formatChartPrice(close, 'usd', 'USD'))
          : cur.executionPriceQuoteDisplay,
      fdvUsdX18,
      fdvDisplay,
    });
  }

  return {
    basis,
    trades,
    anchorPrice: anchorPrice != null && Number.isFinite(anchorPrice) ? anchorPrice : null,
    anchorTrade,
    bars,
  };
}

/** Map movement bars → ChartCandle list (real timestamps; activity plot remaps later). */
export function tradeBarsToCandles(bars: readonly TradeMovementBar[]): ChartCandle[] {
  return bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

/** One volume bar per movement bar; skips null volumes. */
export function tradeBarsToVolume(bars: readonly TradeMovementBar[]): ChartVolumeBar[] {
  const out: ChartVolumeBar[] = [];
  for (const b of bars) {
    if (b.volume == null || !Number.isFinite(b.volume) || b.volume < 0) continue;
    out.push({ time: b.time, value: b.volume, up: b.up });
  }
  return out;
}

/** Restrained PRICE hover readout — execution-specific values only. */
export function formatTradeMovementTooltip(
  bar: TradeMovementBar,
  basis: ChartBasis,
  quoteSymbol: string,
): string {
  const side = bar.side.toUpperCase();
  const price =
    basis === 'usd'
      ? formatChartPrice(bar.close, 'usd', quoteSymbol)
      : formatChartPrice(bar.close, 'quote', quoteSymbol);
  const lines = [side, `Price  ${price}`];
  if (bar.fdvDisplay) {
    lines.push(`FDV  ${bar.fdvDisplay}`);
  }
  if (basis === 'usd' && bar.usdValueDisplay) {
    lines.push(`Trade  $${bar.usdValueDisplay}`);
  } else {
    lines.push(`Trade  ${bar.quoteAmountDisplay} ${quoteSymbol}`);
  }
  return lines.join('\n');
}

/**
 * Merge + dedupe helper for future ~2s live polls.
 * Keeps newest-first or mixed batches idempotent by trade identity.
 */
export function mergeTradesByIdentity(
  existing: readonly TradeItem[],
  incoming: readonly TradeItem[],
): TradeItem[] {
  const map = new Map<string, TradeItem>();
  for (const t of existing) map.set(tradeIdentity(t), t);
  for (const t of incoming) map.set(tradeIdentity(t), t);
  return sortTradesChronological([...map.values()]);
}
