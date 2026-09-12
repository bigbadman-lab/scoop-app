/**
 * Canonical feed membership helpers (N4B.1).
 * Feed identity is separate from relevance_class.
 */

import {
  NEWS_FEED_CATEGORIES,
  type NewsFeedCategory,
  isNewsFeedCategory,
} from './feed-category.js';

const ORDER: readonly NewsFeedCategory[] = NEWS_FEED_CATEGORIES;

/**
 * Add a feed category without removing existing ones.
 * Dedupes; stable order: stocks then markets.
 */
export function addFeedCategory(
  existing: readonly string[] | null | undefined,
  category: NewsFeedCategory,
): NewsFeedCategory[] {
  const set = new Set<NewsFeedCategory>();
  for (const raw of existing ?? []) {
    const v = String(raw).trim().toLowerCase();
    if (isNewsFeedCategory(v)) set.add(v);
  }
  set.add(category);
  return ORDER.filter((c) => set.has(c));
}

/** Merge two membership lists with the same semantics. */
export function mergeFeedCategories(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): NewsFeedCategory[] {
  let out: NewsFeedCategory[] = [];
  for (const raw of [...(a ?? []), ...(b ?? [])]) {
    const v = String(raw).trim().toLowerCase();
    if (isNewsFeedCategory(v)) out = addFeedCategory(out, v);
  }
  return out;
}

/** SQL expression fragment helper docs — union of two text[] without dupes. */
export const FEED_CATEGORIES_UNION_SQL = `
(
  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[])
  FROM unnest(
    COALESCE(provider_news_articles.feed_categories, '{}'::text[])
    || COALESCE(EXCLUDED.feed_categories, '{}'::text[])
  ) AS c
  WHERE c = ANY (ARRAY['stocks','markets']::text[])
)
`.trim();
