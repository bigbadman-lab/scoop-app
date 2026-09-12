import type { NewsFeedCategory } from '@scoop/news';

export type { NewsFeedCategory };

const NEWS_FEED_CATEGORIES = ['stocks', 'markets'] as const satisfies readonly NewsFeedCategory[];

function isNewsFeedCategory(value: string): value is NewsFeedCategory {
  return (NEWS_FEED_CATEGORIES as readonly string[]).includes(value);
}

/** Category browse copy — keep in sync with /news UI cards. */
export const NEWS_CATEGORY_COPY: Record<
  NewsFeedCategory,
  { label: string; description: string }
> = {
  stocks: {
    label: 'Stocks',
    description: 'Stock-moving company news.',
  },
  markets: {
    label: 'Markets',
    description: 'Macro, policy and events moving the tape.',
  },
};

/**
 * Page/URL category resolution (forgiving).
 * Missing / invalid → stocks. API remains strict (400 on invalid).
 */
export function resolveNewsPageCategory(
  value: string | null | undefined,
): NewsFeedCategory {
  if (value == null || !String(value).trim()) return 'stocks';
  const normalized = String(value).trim().toLowerCase();
  return isNewsFeedCategory(normalized) ? normalized : 'stocks';
}

/** Canonical shareable path for a category. Stocks omits the query param. */
export function newsCategoryHref(category: NewsFeedCategory): string {
  return category === 'markets' ? '/news?category=markets' : '/news';
}
