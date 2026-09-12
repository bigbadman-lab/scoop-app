import {
  checkpointProviderForCategory,
  getLatestNews,
  getNewsCheckpoint,
  isNewsPublicDisplayEnabled,
  STOCKNEWS_PROVIDER,
  type NewsFeedCategory,
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

export type { LeadNewsResult, LeadNewsArticle } from '@/lib/news/load-home';
export { loadLeadNews } from '@/lib/news/load-home';

export type LoadPublicNewsOptions = {
  /** Explicit feed category. Defaults to stocks for backward compatibility. */
  category?: NewsFeedCategory;
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

/** Category-aware ingest freshness (Stocks vs Markets checkpoint streams). */
async function loadLastSuccessfulIngestAt(
  category: NewsFeedCategory,
): Promise<string | null> {
  try {
    const checkpoint = await getNewsCheckpoint(
      serverDb(),
      checkpointProviderForCategory(category),
    );
    const at = checkpoint?.lastSuccessAt ?? null;
    if (!at) return null;
    const iso = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  } catch {
    return null;
  }
}

function emptyFeed(
  status: PublicNewsFeedResponse['status'],
  category: NewsFeedCategory,
  asOf: string,
  lastSuccessfulIngestAt: string | null,
  message?: string,
): PublicNewsFeedResponse {
  return {
    status,
    category,
    items: [],
    nextCursor: null,
    message,
    asOf,
    lastSuccessfulIngestAt,
  };
}

/**
 * Canonical public news read — homepage + `/news` + `/api/news`.
 * Always DB-backed; never calls the upstream news provider.
 * Markets attached in one batched query (no N+1).
 *
 * Category membership is authoritative via feed_categories (N4C.1).
 * Default category is stocks so existing /news behavior is preserved.
 */
export async function loadPublicNewsFeed(
  options: LoadPublicNewsOptions = {},
): Promise<PublicNewsFeedResponse> {
  const category: NewsFeedCategory = options.category ?? 'stocks';
  const asOf = new Date().toISOString();
  const lastSuccessfulIngestAt = await loadLastSuccessfulIngestAt(category);
  const limit = Math.min(
    Math.max(options.limit ?? NEWS_PAGE_SIZE, 1),
    50,
  );

  if (!isNewsPublicDisplayEnabled()) {
    return emptyFeed(
      'gated',
      category,
      asOf,
      lastSuccessfulIngestAt,
      'News display is not enabled yet.',
    );
  }

  try {
    const rows: NewsFeedItem[] = await getLatestNews(serverDb(), {
      limit,
      category,
      excludeBackfill: true,
      // Stocks keep the historical public quality gate; Markets membership is ingest-authoritative.
      stockRelevantOnly: category === 'stocks',
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
      marketByArticle = new Map();
    }

    const items: PublicNewsItem[] = rows.map((row) =>
      toPublicNewsItem(row, marketByArticle.get(row.providerArticleId)),
    );
    if (items.length === 0 && !options.cursor) {
      return emptyFeed('empty', category, asOf, lastSuccessfulIngestAt, 'No stories yet.');
    }

    return {
      status: 'ok',
      category,
      items,
      nextCursor: nextCursorFromItems(rows, limit),
      asOf,
      lastSuccessfulIngestAt,
    };
  } catch {
    return emptyFeed('error', category, asOf, lastSuccessfulIngestAt, 'Could not load news.');
  }
}
