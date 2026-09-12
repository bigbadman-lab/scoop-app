/**
 * News ingestion freshness — distinct from article age and feed `asOf`.
 * Canonical source: news_ingestion_checkpoints.last_success_at (stocknewsapi).
 */

/** Cron is ~15m; allow one delayed cycle + ingest duration before STALE. */
export const NEWS_INGEST_STALE_AFTER_MS = 30 * 60 * 1000;

export type NewsIngestHealth = 'live' | 'stale' | 'unavailable';

export function classifyNewsIngestHealth(
  lastSuccessfulIngestAt: string | null | undefined,
  nowMs: number,
  staleAfterMs: number = NEWS_INGEST_STALE_AFTER_MS,
): NewsIngestHealth {
  if (lastSuccessfulIngestAt == null || !String(lastSuccessfulIngestAt).trim()) {
    return 'unavailable';
  }
  const t = Date.parse(lastSuccessfulIngestAt);
  if (!Number.isFinite(t)) return 'unavailable';
  if (nowMs - t >= staleAfterMs) return 'stale';
  return 'live';
}

/** User-facing relative ingest age — never implies the 8s DB poll cadence. */
export function formatNewsLastPull(
  lastSuccessfulIngestAt: string | null | undefined,
  nowMs: number,
): string {
  if (lastSuccessfulIngestAt == null || !String(lastSuccessfulIngestAt).trim()) {
    return 'Last pull —';
  }
  const t = Date.parse(lastSuccessfulIngestAt);
  if (!Number.isFinite(t)) return 'Last pull —';
  const ageSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (ageSec < 60) return 'Last pull now';
  const mins = Math.floor(ageSec / 60);
  if (mins < 60) return `Last pull ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Last pull ${hours}h ago`;
  return `Last pull ${Math.floor(hours / 24)}d ago`;
}

/** Singular/plural market-status label from canonical marketCount. */
export function formatNewsMarketStatusLabel(marketCount: number): string {
  const n = Number.isFinite(marketCount) ? Math.max(0, Math.floor(marketCount)) : 0;
  if (n <= 0) return 'NO LIVE MARKETS';
  if (n === 1) return '1 LIVE MARKET';
  return `${n} LIVE MARKETS`;
}
