import { isNewsPublicDisplayEnabled, getLatestNews, type NewsFeedItem } from '@scoop/news';
import { serverDb } from '@/lib/server/queries';
import { HOMEPAGE_NEWS_ROTATION_POOL } from '@/lib/news/homepage-rotation';

export type LeadNewsResult = {
  status: 'ok' | 'empty' | 'gated' | 'error';
  /** First story — same as `articles[0]` when status is ok. */
  article: NewsFeedItem | null;
  /** DB-backed rotation pool for client-side house story cycling. */
  articles: NewsFeedItem[];
  message?: string;
};

/**
 * Homepage NOW lead + rotation pool — same canonical source as `/news`.
 * Public display remains gated by SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED.
 * Client rotates through `articles` without refetching.
 */
export async function loadLeadNews(): Promise<LeadNewsResult> {
  if (!isNewsPublicDisplayEnabled()) {
    return {
      status: 'gated',
      article: null,
      articles: [],
      message: 'Latest story display is not enabled yet.',
    };
  }

  try {
    const items = await getLatestNews(serverDb(), {
      limit: HOMEPAGE_NEWS_ROTATION_POOL,
      excludeBackfill: true,
      stockRelevantOnly: true,
      orderBy: 'published',
    });
    if (items.length === 0) {
      return {
        status: 'empty',
        article: null,
        articles: [],
        message: 'No stories yet.',
      };
    }
    return {
      status: 'ok',
      article: items[0] ?? null,
      articles: items,
    };
  } catch {
    return {
      status: 'error',
      article: null,
      articles: [],
      message: 'Could not load the latest story.',
    };
  }
}
