import type { CandleInterval } from '@scoop/db';

/** Genuine time-bucket OHLC intervals (candles API). */
export type ChartIntervalId = CandleInterval;

/** Chart selector modes: TRADES (trade-derived) + time-bucket OHLC. */
export type ChartModeId = 'trades' | ChartIntervalId;

export const TRADES_CHART_MODE = 'trades' as const;

export const DEFAULT_CHART_MODE: ChartModeId = 'trades';

/** @deprecated Prefer DEFAULT_CHART_MODE — kept for transitional imports. */
export const DEFAULT_CHART_INTERVAL: ChartModeId = DEFAULT_CHART_MODE;

/** Seed size for TRADES mode (API max = 100). */
export const TRADES_CHART_SEED_LIMIT = 100;

export const CHART_INTERVALS: readonly ChartIntervalId[] = [
  '5s',
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
] as const;

export const CHART_MODES: readonly ChartModeId[] = [
  TRADES_CHART_MODE,
  ...CHART_INTERVALS,
] as const;

export type ChartIntervalConfig = {
  id: ChartIntervalId;
  label: string;
  /**
   * Soft hint for expected active-market coverage (documentation / future UX).
   * Not used as a hard wall-clock `from` filter — interval ≠ lookback window.
   */
  windowSec: number | null;
  /** Max candles to return (latest historical activity, newest-first from API). */
  limit: number;
};

/**
 * Per-interval limits stay under the API/DB 500-candle ceiling.
 * Requests fetch the latest N candles for the interval — not “only if traded recently”.
 */
export const CHART_INTERVAL_CONFIG: Record<ChartIntervalId, ChartIntervalConfig> = {
  '5s': { id: '5s', label: '5s', windowSec: 3600, limit: 500 },
  '1m': { id: '1m', label: '1m', windowSec: 5 * 3600, limit: 300 },
  '5m': { id: '5m', label: '5m', windowSec: 24 * 3600, limit: 300 },
  '15m': { id: '15m', label: '15m', windowSec: 3 * 86_400, limit: 300 },
  '1h': { id: '1h', label: '1h', windowSec: 14 * 86_400, limit: 350 },
  '4h': { id: '4h', label: '4h', windowSec: 60 * 86_400, limit: 400 },
  '1d': { id: '1d', label: '1d', windowSec: null, limit: 500 },
};

export function chartModeLabel(mode: ChartModeId): string {
  return mode === 'trades' ? 'TRADES' : CHART_INTERVAL_CONFIG[mode].label;
}

export function isChartIntervalId(value: string): value is ChartIntervalId {
  return (CHART_INTERVALS as readonly string[]).includes(value);
}

export function isChartModeId(value: string): value is ChartModeId {
  return (CHART_MODES as readonly string[]).includes(value);
}

/**
 * Candle API query for a selected interval.
 * Intentionally omits wall-clock `from` — interval is aggregation size;
 * `limit` returns the most recent real historical candles for that granularity.
 *
 * Second arg kept for call-site compatibility (previously derived `from` from wall clock).
 */
export function candleQueryForInterval(
  interval: ChartIntervalId,
  _nowSec?: number,
): { interval: CandleInterval; limit: number } {
  void _nowSec;
  const cfg = CHART_INTERVAL_CONFIG[interval];
  return {
    interval: cfg.id,
    limit: cfg.limit,
  };
}

/** @deprecated Use ChartModeId — kept briefly for migration clarity in tests. */
export type ChartRangeId = ChartModeId;
/** @deprecated */
export const DEFAULT_CHART_RANGE = DEFAULT_CHART_MODE;
/** @deprecated */
export const candleQueryForRange = candleQueryForInterval;
