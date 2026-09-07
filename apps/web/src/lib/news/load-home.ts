import { isNewsPublicDisplayEnabled, getLatestNews, type NewsFeedItem } from '@scoop/news';
import { serverDb } from '@/lib/server/queries';

export type LeadNewsResult = {
  status: 'ok' | 'empty' | 'gated' | 'error';
  article: NewsFeedItem | null;
  message?: string;
};

/**
 * Latest news for the NOW lead — same canonical source as `/news`.
 * Public display remains gated by SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED.
 * Launch-as-token CTAs live on NowSection / NewsFeed (Phase A).
 */
export async function loadLeadNews(): Promise<LeadNewsResult> {
  if (!isNewsPublicDisplayEnabled()) {
    return {
      status: 'gated',
      article: null,
      message: 'Latest story display is not enabled yet.',
    };
  }

  try {
    const items = await getLatestNews(serverDb(), {
      limit: 1,
      excludeBackfill: true,
      orderBy: 'published',
    });
    const article = items[0] ?? null;
    if (!article) {
      return {
        status: 'empty',
        article: null,
        message: 'No stories yet.',
      };
    }
    return { status: 'ok', article };
  } catch {
    return {
      status: 'error',
      article: null,
      message: 'Could not load the latest story.',
    };
  }
}
