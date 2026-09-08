import type { NewsFeedItem } from '@scoop/news';

/** Client-side homepage story rotation — never triggers network. */
export const HOMEPAGE_NEWS_ROTATION_MS = 20_000;

/** Soft fade when swapping the lead story overlay. */
export const HOMEPAGE_NEWS_FADE_MS = 400;

/**
 * How many DB stories the homepage loads for rotation.
 * UI currently shows 1 lead slot; 24 ≈ 8 minutes of unique stories at 20s.
 */
export const HOMEPAGE_NEWS_ROTATION_POOL = 24;

/** Visible news overlays on the homepage house module (current UI = 1 lead). */
export const HOMEPAGE_VISIBLE_NEWS_SLOTS = 1;

export function shouldRotateHomepageNews(
  articleCount: number,
  slotCount: number = HOMEPAGE_VISIBLE_NEWS_SLOTS,
): boolean {
  return articleCount > slotCount && slotCount > 0;
}

/**
 * Deterministic window of stories for the current rotation offset.
 * Never duplicates within the window when articleCount >= slotCount.
 */
export function visibleHomepageArticles<T extends { providerArticleId: string }>(
  articles: readonly T[],
  offset: number,
  slotCount: number = HOMEPAGE_VISIBLE_NEWS_SLOTS,
): T[] {
  if (articles.length === 0 || slotCount <= 0) return [];
  const n = articles.length;
  const start = ((offset % n) + n) % n;
  const count = Math.min(slotCount, n);
  const out: T[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const item = articles[(start + i) % n]!;
    if (seen.has(item.providerArticleId)) break;
    seen.add(item.providerArticleId);
    out.push(item);
  }
  return out;
}

export function nextHomepageNewsOffset(
  offset: number,
  articleCount: number,
  slotCount: number = HOMEPAGE_VISIBLE_NEWS_SLOTS,
): number {
  if (!shouldRotateHomepageNews(articleCount, slotCount)) return 0;
  return (offset + slotCount) % articleCount;
}

export function homepageArticlesSignature(
  articles: readonly Pick<NewsFeedItem, 'providerArticleId'>[],
): string {
  return articles.map((a) => a.providerArticleId).join('|');
}
