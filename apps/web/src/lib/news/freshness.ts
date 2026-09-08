/**
 * Editorial freshness for /news hierarchy.
 * Age windows align with formatNewsAge "JUST IN" (<90s).
 */

export type NewsFreshness = 'just_in' | 'new' | 'recent' | 'older';

/** Under 90s — matches JUST IN age label. */
export const NEWS_JUST_IN_MS = 90_000;
/** Under 60m — still clearly "new" on the desk. */
export const NEWS_NEW_MS = 60 * 60_000;
/** Under 6h — same-session recent, softer emphasis. */
export const NEWS_RECENT_MS = 6 * 60 * 60_000;

export function classifyNewsFreshness(
  publishedAtIso: string,
  now = Date.now(),
): NewsFreshness {
  const then = new Date(publishedAtIso).getTime();
  if (Number.isNaN(then)) return 'older';
  const age = Math.max(0, now - then);
  if (age < NEWS_JUST_IN_MS) return 'just_in';
  if (age < NEWS_NEW_MS) return 'new';
  if (age < NEWS_RECENT_MS) return 'recent';
  return 'older';
}

export function isNewsFresh(freshness: NewsFreshness): boolean {
  return freshness === 'just_in' || freshness === 'new';
}
