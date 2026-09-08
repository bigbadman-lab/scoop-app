import type { CandleInterval } from '@scoop/db';

/** Candle interval is the primary chart control (not a page history range). */
export type ChartIntervalId = CandleInterval;

export const DEFAULT_CHART_INTERVAL: ChartIntervalId = '5m';

export const CHART_INTERVALS: readonly ChartIntervalId[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
] as const;

export type ChartIntervalConfig = {
  id: ChartIntervalId;
  label: string;
  /** Rolling history window in seconds; null = unbounded (still capped by limit). */
  windowSec: number | null;
  limit: number;
};

/**
 * Bounded history per candle size — stay under API/DB 500-candle ceiling.
 * 1m→~5h, 5m→24h, 15m→3d, 1h→14d, 4h→60d, 1d→long history.
 */
export const CHART_INTERVAL_CONFIG: Record<ChartIntervalId, ChartIntervalConfig> = {
  '1m': { id: '1m', label: '1m', windowSec: 5 * 3600, limit: 300 },
  '5m': { id: '5m', label: '5m', windowSec: 24 * 3600, limit: 300 },
  '15m': { id: '15m', label: '15m', windowSec: 3 * 86_400, limit: 300 },
  '1h': { id: '1h', label: '1h', windowSec: 14 * 86_400, limit: 350 },
  '4h': { id: '4h', label: '4h', windowSec: 60 * 86_400, limit: 400 },
  '1d': { id: '1d', label: '1d', windowSec: null, limit: 500 },
};

export function isChartIntervalId(value: string): value is ChartIntervalId {
  return (CHART_INTERVALS as readonly string[]).includes(value);
}

/** Build candle API query for a selected candle interval. */
export function candleQueryForInterval(
  interval: ChartIntervalId,
  nowSec = Math.floor(Date.now() / 1000),
): { interval: CandleInterval; from?: number; limit: number } {
  const cfg = CHART_INTERVAL_CONFIG[interval];
  if (cfg.windowSec == null) {
    return { interval: cfg.id, limit: cfg.limit };
  }
  return {
    interval: cfg.id,
    from: nowSec - cfg.windowSec,
    limit: cfg.limit,
  };
}

/** @deprecated Use ChartIntervalId — kept briefly for migration clarity in tests. */
export type ChartRangeId = ChartIntervalId;
/** @deprecated */
export const DEFAULT_CHART_RANGE = DEFAULT_CHART_INTERVAL;
/** @deprecated */
export const candleQueryForRange = candleQueryForInterval;
