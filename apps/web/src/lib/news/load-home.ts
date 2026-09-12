import {
  getLatestNews,
  isNewsPublicDisplayEnabled,
  STOCKNEWS_PROVIDER,
  type NewsFeedItem,
} from '@scoop/news';
import { getNewsArticleMarketsForArticles } from '@scoop/db';
import { serverDb } from '@/lib/server/queries';
import { HOMEPAGE_NEWS_ROTATION_POOL } from '@/lib/news/homepage-rotation';
import type { PublicNewsMarketSummary } from '@/lib/news/public';

/** Homepage story = feed item + canonical market attachment (same semantics as /news). */
export type LeadNewsArticle = NewsFeedItem & {
  marketCount: number;
  markets: PublicNewsMarketSummary[];
};

export type LeadNewsResult = {
  status: 'ok' | 'empty' | 'gated' | 'error';
  /** First story — same as `articles[0]` when status is ok. */
  article: LeadNewsArticle | null;
  /** DB-backed rotation pool for client-side house story cycling. */
  articles: LeadNewsArticle[];
  message?: string;
};

function toPublicMarket(m: {
  chainId: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  quoteAsset: string;
  launchedAt: number;
  ageSeconds: number;
  priceUsdDisplay: string | null;
  fdvUsdDisplay: string | null;
  volume24hUsdDisplay: string | null;
}): PublicNewsMarketSummary {
  return {
    chainId: m.chainId,
    tokenAddress: m.tokenAddress,
    symbol: m.symbol,
    name: m.name,
    quoteAsset: m.quoteAsset,
    launchedAt: m.launchedAt,
    ageSeconds: m.ageSeconds,
    priceUsdDisplay: m.priceUsdDisplay,
    fdvUsdDisplay: m.fdvUsdDisplay,
    volume24hUsdDisplay: m.volume24hUsdDisplay,
  };
}

async function attachMarkets(rows: NewsFeedItem[]): Promise<LeadNewsArticle[]> {
  if (rows.length === 0) return [];
  try {
    const bundles = await getNewsArticleMarketsForArticles(serverDb(), {
      provider: STOCKNEWS_PROVIDER,
      providerArticleIds: rows.map((r) => r.providerArticleId),
      perArticleLimit: 3,
    });
    return rows.map((row) => {
      const bundle = bundles.get(row.providerArticleId);
      return {
        ...row,
        marketCount: bundle?.marketCount ?? 0,
        markets: (bundle?.markets ?? []).map(toPublicMarket),
      };
    });
  } catch {
    return rows.map((row) => ({ ...row, marketCount: 0, markets: [] }));
  }
}

/**
 * Homepage NOW lead + rotation pool — same canonical source as `/news`.
 * Public display remains gated by SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED.
 * Client rotates through `articles` without refetching.
 * Market counts reuse getNewsArticleMarketsForArticles (no second implementation).
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
      category: 'stocks',
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
    const articles = await attachMarkets(items);
    return {
      status: 'ok',
      article: articles[0] ?? null,
      articles,
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
