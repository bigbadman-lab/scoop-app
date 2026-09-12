import type { PublicNewsItem } from '@/lib/news/public';

/** Match homepage desk cadence — lead story only, not full-feed reshuffle. */
export const NEWS_LEAD_ROTATION_MS = 8_000;

/** Soft fade when swapping the dedicated lead slot. */
export const NEWS_LEAD_FADE_MS = 300;

/** Newest N loaded stories participate in the rotating lead; the rest stay static. */
export const NEWS_LEAD_ROTATION_COUNT = 5;

export function splitNewsLeadFeed<T>(
  items: readonly T[],
  count: number = NEWS_LEAD_ROTATION_COUNT,
): { leadPool: T[]; staticFeed: T[] } {
  const n = Math.max(0, Math.floor(count));
  return {
    leadPool: items.slice(0, n),
    staticFeed: items.slice(n),
  };
}

export function leadPoolSignature(
  pool: readonly Pick<PublicNewsItem, 'id'>[],
): string {
  return pool.map((item) => item.id).join('|');
}

/** Keep active lead when still in pool; otherwise fall back to first / null. */
export function reconcileLeadArticleId(
  pool: readonly Pick<PublicNewsItem, 'id'>[],
  activeId: string | null,
): string | null {
  if (pool.length === 0) return null;
  if (activeId && pool.some((item) => item.id === activeId)) return activeId;
  return pool[0]!.id;
}

export function nextLeadArticleId(
  pool: readonly Pick<PublicNewsItem, 'id'>[],
  activeId: string | null,
): string | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!.id;
  const idx = pool.findIndex((item) => item.id === activeId);
  const next = idx < 0 ? 0 : (idx + 1) % pool.length;
  return pool[next]!.id;
}

export function leadArticleIndex(
  pool: readonly Pick<PublicNewsItem, 'id'>[],
  activeId: string | null,
): number {
  if (pool.length === 0 || activeId == null) return -1;
  return pool.findIndex((item) => item.id === activeId);
}

export function shouldRotateNewsLead(poolSize: number): boolean {
  return poolSize > 1;
}
