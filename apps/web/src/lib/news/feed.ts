import {
  getLatestNews,
  isNewsPublicDisplayEnabled,
  STOCKNEWS_PROVIDER,
  type NewsFeedCursor,
  type NewsFeedItem,
} from '@scoop/news';
import { getNewsArticleMarketsForArticles } from '@scoop/db';
import { serverDb } from '@/lib/server/queries';
import {
  NEWS_PAGE_SIZE,
  nextCursorFromItems,
  toPublicNewsItem,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
  type PublicNewsMarketSummary,
} from '@/lib/news/public';

export type { LeadNewsResult } from '@/lib/news/load-home';
export { loadLeadNews } from '@/lib/news/load-home';

export type LoadPublicNewsOptions = {
  limit?: number;
  cursor?: NewsFeedCursor | null;
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

/**
 * Canonical public news read — homepage + `/news` + `/api/news`.
 * Always DB-backed; never calls the upstream news provider.
 * Markets attached in one batched query (no N+1).
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
      stockRelevantOnly: true,
      orderBy: 'published',
      cursor: options.cursor ?? undefined,
    });

    let marketByArticle = new Map<
      string,
      { marketCount: number; markets: PublicNewsMarketSummary[] }
    >();
    try {
      const bundles = await getNewsArticleMarketsForArticles(serverDb(), {
        provider: STOCKNEWS_PROVIDER,
        providerArticleIds: rows.map((r) => r.providerArticleId),
        perArticleLimit: 3,
      });
      marketByArticle = new Map(
        [...bundles.entries()].map(([id, bundle]) => [
          id,
          {
            marketCount: bundle.marketCount,
            markets: bundle.markets.map(toPublicMarket),
          },
        ]),
      );
    } catch {
      // Failure isolation: feed still renders without MARKET LIVE.
      marketByArticle = new Map();
    }

    const items: PublicNewsItem[] = rows.map((row) =>
      toPublicNewsItem(row, marketByArticle.get(row.providerArticleId)),
    );
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
