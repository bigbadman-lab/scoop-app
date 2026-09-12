/**
 * Canonical logical news feed identities (N4B / N4C.1).
 * Distinct from provider name (`stocknewsapi`) and from relevance_class.
 */
export const NEWS_FEED_CATEGORIES = ['stocks', 'markets'] as const;

export type NewsFeedCategory = (typeof NEWS_FEED_CATEGORIES)[number];

export function isNewsFeedCategory(value: string): value is NewsFeedCategory {
  return (NEWS_FEED_CATEGORIES as readonly string[]).includes(value);
}

export type ParseNewsFeedCategoryResult =
  | { ok: true; category: NewsFeedCategory; defaulted: boolean }
  | { ok: false; error: string };

/**
 * Parse a public/API category value.
 * - missing/undefined → stocks (backward-compatible default)
 * - stocks|markets → that category (case-insensitive)
 * - empty/unknown explicit value → invalid (caller should 400)
 */
export function parseNewsFeedCategory(
  value: string | null | undefined,
): ParseNewsFeedCategoryResult {
  if (value == null) {
    return { ok: true, category: 'stocks', defaulted: true };
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Invalid category' };
  }
  const normalized = trimmed.toLowerCase();
  if (isNewsFeedCategory(normalized)) {
    return { ok: true, category: normalized, defaulted: false };
  }
  return { ok: false, error: 'Invalid category' };
}

/** Checkpoint key for Stocks stream — matches historical `provider` PK rows. */
export const STOCKS_CHECKPOINT_PROVIDER = 'stocknewsapi' as const;

/**
 * Markets checkpoint stream identity.
 * Article provider identity remains `stocknewsapi` — do not conflate.
 */
export const MARKETS_CHECKPOINT_PROVIDER = 'stocknewsapi:markets' as const;

/** Checkpoint provider key for a public feed category. */
export function checkpointProviderForCategory(
  category: NewsFeedCategory,
): typeof STOCKS_CHECKPOINT_PROVIDER | typeof MARKETS_CHECKPOINT_PROVIDER {
  return category === 'markets'
    ? MARKETS_CHECKPOINT_PROVIDER
    : STOCKS_CHECKPOINT_PROVIDER;
}
