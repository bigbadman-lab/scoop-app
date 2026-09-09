import type { CandleItem } from '@scoop/db';
import type { ChartIntervalId } from '@/lib/token/chart-ranges';

export type ChartBasis = 'usd' | 'quote';

/** Candlestick OHLC for lightweight-charts (unix seconds). */
export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Volume histogram bar — real indexed volume only (never fabricated). */
export type ChartVolumeBar = {
  time: number;
  value: number;
  /** True when close >= open (bullish candle). */
  up: boolean;
};

/** Interval length in seconds for whitespace gap filling. */
export const CHART_INTERVAL_SECONDS: Record<ChartIntervalId, number> = {
  '5s': 5,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
};

/** Cap whitespace inserts so sparse long ranges stay performant. */
export const MAX_WHITESPACE_POINTS = 1500;

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

/**
 * Map real indexed volume for the histogram.
 * Prefer USD volume when USD basis is active; otherwise quote volume.
 * Skips bars with missing volume — never invents zeros from null.
 */
export function candlesToVolume(
  candles: readonly CandleItem[],
  basis: ChartBasis,
): ChartVolumeBar[] {
  const ascending = [...candles].sort((a, b) => a.bucketStart - b.bucketStart);
  const out: ChartVolumeBar[] = [];
  for (const c of ascending) {
    const open = x18ToChartNumber(basis === 'usd' ? c.openUsdX18 : c.openQuoteX18);
    const close = x18ToChartNumber(basis === 'usd' ? c.closeUsdX18 : c.closeQuoteX18);
    if (open == null || close == null) continue;

    let value: number | null = null;
    if (basis === 'usd') {
      value = x18ToChartNumber(c.usdVolumeX18);
    } else {
      value = x18ToChartNumber(c.quoteVolumeRaw);
    }
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    out.push({ time: c.bucketStart, value, up: close >= open });
  }
  return out;
}

/**
 * Align volume 1:1 with real candles by real timestamp.
 * No volume bars without a matching candle; no fabricated zeros.
 */
export function alignVolumeToCandles(
  candles: readonly ChartCandle[],
  volume: readonly ChartVolumeBar[],
): ChartVolumeBar[] {
  const byTime = new Map(volume.map((v) => [v.time, v]));
  const out: ChartVolumeBar[] = [];
  for (const c of candles) {
    const v = byTime.get(c.time);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Activity-centric plot: equal logical spacing for real candles only.
 * Plot `time` is a sequential index (1..n); `realTimeByPlot` preserves truthful timestamps
 * for axis labels and tooltips. Does not invent OHLC or fill dead wall-clock time.
 */
export function buildActivityCentricPlot(
  candles: readonly ChartCandle[],
  volume: readonly ChartVolumeBar[],
): {
  candles: ChartCandle[];
  volume: ChartVolumeBar[];
  realTimeByPlot: Map<number, number>;
} {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const alignedVol = alignVolumeToCandles(sorted, volume);
  const volByReal = new Map(alignedVol.map((v) => [v.time, v]));
  const realTimeByPlot = new Map<number, number>();
  const plottedCandles: ChartCandle[] = [];
  const plottedVolume: ChartVolumeBar[] = [];

  sorted.forEach((c, i) => {
    const plotTime = i + 1;
    realTimeByPlot.set(plotTime, c.time);
    plottedCandles.push({
      time: plotTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });
    const v = volByReal.get(c.time);
    if (v) {
      plottedVolume.push({ time: plotTime, value: v.value, up: v.up });
    }
  });

  return { candles: plottedCandles, volume: plottedVolume, realTimeByPlot };
}

/** Default chart width assumption when container size is unknown (tests / SSR). */
export const CHART_VIEWPORT_ASSUMED_WIDTH_PX = 720;

/**
 * Cap on bar width so sparse candles stay professional (not full-bleed blocks).
 * Must be high enough that 3–5 candles can occupy a meaningful share of a typical chart.
 */
export const CHART_MAX_BAR_SPACING = 28;
export const CHART_MIN_BAR_SPACING = 4;
export const CHART_DEFAULT_BAR_SPACING = 12;

/**
 * Fraction of chart width the real candle cluster should occupy (rest = symmetric padding).
 * Sparse → lower fraction (more breathing room). Dense → nearly full width.
 */
export function activityClusterFraction(candleCount: number): number {
  const n = Math.max(candleCount, 1);
  if (n <= 1) return 0.22;
  if (n <= 3) return 0.32;
  if (n <= 5) return 0.38;
  if (n <= 20) return 0.55;
  if (n <= 50) return 0.75;
  return 0.92;
}

/**
 * Count-aware visible logical range that centers real activity.
 *
 * Root cause of edge-clustering: with a tight logical range + low `maxBarSpacing`,
 * LWC clamps bar width and leaves unused pixels on one side. We size the visible
 * span so that at the effective bar spacing the cluster sits in the middle with
 * proportional padding — no synthetic candles.
 */
export function activityVisibleLogicalRange(
  candleCount: number,
  options?: {
    containerWidthPx?: number;
    maxBarSpacing?: number;
  },
): { from: number; to: number } {
  const n = Math.max(candleCount, 1);
  const width = Math.max(
    160,
    options?.containerWidthPx ?? CHART_VIEWPORT_ASSUMED_WIDTH_PX,
  );
  const maxBar = options?.maxBarSpacing ?? CHART_MAX_BAR_SPACING;
  const fraction = activityClusterFraction(n);

  // Spacing that would place the n-bar cluster at `fraction` of width, capped.
  const uncapped = (width * fraction) / n;
  const spacing = Math.min(maxBar, Math.max(CHART_MIN_BAR_SPACING, uncapped));

  // Logical span that fills the container at that spacing → leftover = padding.
  const visibleLogical = width / spacing;
  const pad = Math.max(1, (visibleLogical - n) / 2);

  return {
    from: 1 - pad,
    to: n + pad,
  };
}

/**
 * @deprecated Prefer activity-centric logical spacing (buildActivityCentricPlot).
 * Kept for tests documenting that whitespace must not invent OHLC.
 */
export function withWhitespaceGaps(
  candles: readonly ChartCandle[],
  intervalSec: number,
  maxWhitespace = MAX_WHITESPACE_POINTS,
): Array<ChartCandle | { time: number }> {
  if (candles.length === 0 || intervalSec <= 0) return [...candles];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: Array<ChartCandle | { time: number }> = [];
  let whitespaceUsed = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    if (i > 0) {
      const prev = sorted[i - 1]!;
      const gap = cur.time - prev.time;
      if (gap > intervalSec) {
        let t = prev.time + intervalSec;
        while (t < cur.time && whitespaceUsed < maxWhitespace) {
          out.push({ time: t });
          whitespaceUsed += 1;
          t += intervalSec;
        }
      }
    }
    out.push(cur);
  }
  return out;
}

/** @deprecated Prefer alignVolumeToCandles + buildActivityCentricPlot. */
export function withVolumeWhitespace(
  volume: readonly ChartVolumeBar[],
  candleTimes: readonly number[],
): Array<ChartVolumeBar | { time: number }> {
  const byTime = new Map(volume.map((v) => [v.time, v]));
  return candleTimes.map((time) => byTime.get(time) ?? { time });
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
