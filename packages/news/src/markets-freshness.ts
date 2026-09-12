/**
 * Markets freshness gate (N4B).
 *
 * Plan blocks `date` on `/category?section=general`, so we cannot rely on
 * provider date windows. Live pagination is newest-first and page-1 of 50
 * was entirely within ~24h; a 15-minute cron only needs short overlap.
 *
 * 36h balances: (a) absorb delayed/failed ticks + weekends, (b) avoid the
 * deep archive that unbounded category pagination would otherwise expose.
 */
export const MARKETS_MAX_ARTICLE_AGE_MS = 36 * 60 * 60 * 1000;

export function isWithinMarketsAgeWindow(
  publishedAt: Date,
  now: Date = new Date(),
  maxAgeMs: number = MARKETS_MAX_ARTICLE_AGE_MS,
): boolean {
  const age = now.getTime() - publishedAt.getTime();
  if (!Number.isFinite(age)) return false;
  return age >= 0 && age <= maxAgeMs;
}

export function marketsArticleAgeMs(publishedAt: Date, now: Date = new Date()): number {
  return Math.max(0, now.getTime() - publishedAt.getTime());
}
