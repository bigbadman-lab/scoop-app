import {
  getLatestNews,
  isNewsPublicDisplayEnabled,
  type NewsFeedCursor,
  type NewsFeedItem,
} from '@scoop/news';
import { serverDb } from '@/lib/server/queries';
import {
  NEWS_PAGE_SIZE,
  nextCursorFromItems,
  toPublicNewsItem,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
} from '@/lib/news/public';

export type { LeadNewsResult } from '@/lib/news/load-home';
export { loadLeadNews } from '@/lib/news/load-home';

export type LoadPublicNewsOptions = {
  limit?: number;
  cursor?: NewsFeedCursor | null;
};

/**
 * Canonical public news read — homepage + `/news` + `/api/news`.
 * Always DB-backed; never calls Tiingo.
 * Orders by authoritative `provider_published_at` (fallback tie-break id).
 */
export async function loadPublicNewsFeed(
  options: LoadPublicNewsOptions = {},
): Promise<PublicNewsFeedResponse> {
  const asOf = new Date().toISOString();
  const limit = Math.min(
    Math.max(options.limit ?? NEWS_PAGE_SIZE, 1),
    50,
  );

  if (!isNewsPublicDisplayEnabled()) {
    return {
      status: 'gated',
      items: [],
      nextCursor: null,
      message: 'News display is not enabled yet.',
      asOf,
    };
  }

  try {
    const rows: NewsFeedItem[] = await getLatestNews(serverDb(), {
      limit,
      excludeBackfill: true,
      orderBy: 'published',
      cursor: options.cursor ?? undefined,
    });

    const items: PublicNewsItem[] = rows.map(toPublicNewsItem);
    if (items.length === 0 && !options.cursor) {
      return {
        status: 'empty',
        items: [],
        nextCursor: null,
        message: 'No stories yet.',
        asOf,
      };
    }

    return {
      status: 'ok',
      items,
      nextCursor: nextCursorFromItems(rows, limit),
      asOf,
    };
  } catch {
    return {
      status: 'error',
      items: [],
      nextCursor: null,
      message: 'Could not load news.',
      asOf,
    };
  }
}
