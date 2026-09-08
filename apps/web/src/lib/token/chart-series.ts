import type { CandleItem } from '@scoop/db';

export type ChartBasis = 'usd' | 'quote';

/** Candlestick OHLC for lightweight-charts (unix seconds). */
export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * Convert indexed x18 decimal string → JS number for chart axes only.
 * Safe for HELLO-scale prices (~1e-6). Does not reconstruct valuation.
 */
export function x18ToChartNumber(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  try {
    const bi = BigInt(raw);
    if (bi === BigInt(0)) return 0;
    const neg = bi < BigInt(0);
    const abs = neg ? -bi : bi;
    const scale = BigInt(10) ** BigInt(18);
    const whole = abs / scale;
    const frac = abs % scale;
    const n = Number(`${whole.toString()}.${frac.toString().padStart(18, '0')}`);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  } catch {
    return null;
  }
}

function hasUsdOhlc(c: CandleItem): boolean {
  return (
    c.openUsdX18 != null &&
    c.openUsdX18 !== '' &&
    c.highUsdX18 != null &&
    c.highUsdX18 !== '' &&
    c.lowUsdX18 != null &&
    c.lowUsdX18 !== '' &&
    c.closeUsdX18 != null &&
    c.closeUsdX18 !== ''
  );
}

/** USD-first: every candle must have full USD OHLC to trust the series. */
export function candlesHaveCompleteUsd(candles: readonly CandleItem[]): boolean {
  if (candles.length === 0) return false;
  return candles.every(hasUsdOhlc);
}

export function selectChartBasis(candles: readonly CandleItem[]): ChartBasis {
  return candlesHaveCompleteUsd(candles) ? 'usd' : 'quote';
}

/**
 * Build a single-currency OHLC series (oldest → newest).
 * Never mixes USD and quote candles.
 */
export function candlesToOhlc(
  candles: readonly CandleItem[],
  basis: ChartBasis,
): ChartCandle[] {
  const ascending = [...candles].sort((a, b) => a.bucketStart - b.bucketStart);
  const out: ChartCandle[] = [];
  for (const c of ascending) {
    const open = x18ToChartNumber(basis === 'usd' ? c.openUsdX18 : c.openQuoteX18);
    const high = x18ToChartNumber(basis === 'usd' ? c.highUsdX18 : c.highQuoteX18);
    const low = x18ToChartNumber(basis === 'usd' ? c.lowUsdX18 : c.lowQuoteX18);
    const close = x18ToChartNumber(basis === 'usd' ? c.closeUsdX18 : c.closeQuoteX18);
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    out.push({ time: c.bucketStart, open, high, low, close });
  }
  return out;
}

/** @deprecated Prefer candlesToOhlc for candlestick charts. */
export function candlesToChartPoints(
  candles: readonly CandleItem[],
  basis: ChartBasis,
): Array<{ time: number; value: number }> {
  return candlesToOhlc(candles, basis).map((c) => ({ time: c.time, value: c.close }));
}

/** Format axis/tooltip prices without collapsing tiny non-zero values to 0. */
export function formatChartPrice(
  value: number,
  basis: ChartBasis,
  quoteSymbol: string,
): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return basis === 'usd' ? '$0' : `0 ${quoteSymbol}`;

  const abs = Math.abs(value);
  let digits = 2;
  if (abs < 1) {
    digits = Math.min(12, Math.max(4, Math.ceil(-Math.log10(abs)) + 3));
  }
  let body = value.toFixed(digits);
  if (body.includes('.')) {
    body = body.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (body === '0' || body === '-0') {
    body = value.toExponential(4);
  }
  return basis === 'usd' ? `$${body}` : `${body} ${quoteSymbol}`;
}

export function formatOhlcTooltip(
  candle: ChartCandle,
  basis: ChartBasis,
  quoteSymbol: string,
): string {
  return [
    `O  ${formatChartPrice(candle.open, basis, quoteSymbol)}`,
    `H  ${formatChartPrice(candle.high, basis, quoteSymbol)}`,
    `L  ${formatChartPrice(candle.low, basis, quoteSymbol)}`,
    `C  ${formatChartPrice(candle.close, basis, quoteSymbol)}`,
  ].join('\n');
}

export function chartBasisLabel(basis: ChartBasis, quoteSymbol: string): string {
  return basis === 'usd' ? 'USD' : quoteSymbol;
}
