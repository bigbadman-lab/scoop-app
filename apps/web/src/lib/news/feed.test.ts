import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNewsPublicDisplayEnabled = vi.fn();
const getLatestNews = vi.fn();
const getNewsArticleMarketsForArticles = vi.fn();

vi.mock('@scoop/news', () => ({
  isNewsPublicDisplayEnabled: () => isNewsPublicDisplayEnabled(),
  getLatestNews: (...args: unknown[]) => getLatestNews(...args),
  STOCKNEWS_PROVIDER: 'stocknewsapi',
}));

vi.mock('@scoop/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@scoop/db')>();
  return {
    ...actual,
    getNewsArticleMarketsForArticles: (...args: unknown[]) =>
      getNewsArticleMarketsForArticles(...args),
  };
});

vi.mock('@/lib/server/queries', () => ({
  serverDb: () => ({}),
}));

describe('loadPublicNewsFeed / loadLeadNews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNewsArticleMarketsForArticles.mockResolvedValue(new Map());
  });

  it('returns gated without querying when display disabled', async () => {
    isNewsPublicDisplayEnabled.mockReturnValue(false);
    const { loadPublicNewsFeed } = await import('@/lib/news/feed');
    const feed = await loadPublicNewsFeed();
    expect(feed.status).toBe('gated');
    expect(feed.items).toEqual([]);
    expect(getLatestNews).not.toHaveBeenCalled();
  });

  it('returns empty when DB has no rows', async () => {
    isNewsPublicDisplayEnabled.mockReturnValue(true);
    getLatestNews.mockResolvedValue([]);
    const { loadPublicNewsFeed } = await import('@/lib/news/feed');
    const feed = await loadPublicNewsFeed({ limit: 20 });
    expect(feed.status).toBe('empty');
    expect(getLatestNews).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        limit: 20,
        excludeBackfill: true,
        stockRelevantOnly: true,
        orderBy: 'published',
      }),
    );
  });

  it('maps newest-first public items and batches markets once', async () => {
    isNewsPublicDisplayEnabled.mockReturnValue(true);
    getLatestNews.mockResolvedValue([
      {
        providerArticleId: '9',
        headline: 'Lead',
        description: 'body',
        sourceDomain: 'ft.com',
        url: 'https://ft.com/x',
        publishedAt: '2026-09-07T12:00:00.000Z',
        crawledAt: '2026-09-07T12:00:01.000Z',
        tickers: ['MSFT'],
        tags: [],
        isBackfillCandidate: false,
      },
    ]);
    getNewsArticleMarketsForArticles.mockResolvedValue(
      new Map([
        [
          '9',
          {
            providerArticleId: '9',
            marketCount: 1,
            markets: [
              {
                chainId: 4663,
                tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
                symbol: 'HELLO',
                name: 'Hello',
                quoteAsset: '0x0000000000000000000000000000000000000000',
                launchedAt: 1,
                ageSeconds: 1,
                priceUsdX18: null,
                priceUsdDisplay: null,
                fdvUsdX18: null,
                fdvUsdDisplay: null,
                volume24hUsdX18: null,
                volume24hUsdDisplay: null,
              },
            ],
          },
        ],
      ]),
    );
    const { loadPublicNewsFeed } = await import('@/lib/news/feed');
    const feed = await loadPublicNewsFeed({ limit: 1 });
    expect(feed.status).toBe('ok');
    expect(feed.items[0]).toMatchObject({
      id: '9',
      headline: 'Lead',
      summary: 'body',
      sourceDomain: 'ft.com',
      url: 'https://ft.com/x',
      marketCount: 1,
    });
    expect(feed.items[0]!.markets[0]!.symbol).toBe('HELLO');
    expect(getNewsArticleMarketsForArticles).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(feed)).not.toContain('isBackfillCandidate');
  });

  it('keeps feed ok when market enrichment fails', async () => {
    isNewsPublicDisplayEnabled.mockReturnValue(true);
    getLatestNews.mockResolvedValue([
      {
        providerArticleId: '9',
        headline: 'Lead',
        description: null,
        sourceDomain: 'ft.com',
        url: 'https://ft.com/x',
        publishedAt: '2026-09-07T12:00:00.000Z',
        crawledAt: '2026-09-07T12:00:01.000Z',
        tickers: [],
        tags: [],
        isBackfillCandidate: false,
      },
    ]);
    getNewsArticleMarketsForArticles.mockRejectedValue(new Error('db down'));
    const { loadPublicNewsFeed } = await import('@/lib/news/feed');
    const feed = await loadPublicNewsFeed({ limit: 1 });
    expect(feed.status).toBe('ok');
    expect(feed.items[0]!.marketCount).toBe(0);
  });

  it('loadLeadNews loads a rotation pool with published order + gate', async () => {
    isNewsPublicDisplayEnabled.mockReturnValue(true);
    getLatestNews.mockResolvedValue([
      {
        providerArticleId: '1',
        headline: 'Home lead',
        description: null,
        sourceDomain: 'bbc.com',
        url: 'https://bbc.com/a',
        publishedAt: '2026-09-07T11:00:00.000Z',
        crawledAt: '2026-09-07T11:00:00.000Z',
        tickers: [],
        tags: [],
        isBackfillCandidate: false,
      },
      {
        providerArticleId: '2',
        headline: 'Second',
        description: null,
        sourceDomain: 'bbc.com',
        url: 'https://bbc.com/b',
        publishedAt: '2026-09-07T10:00:00.000Z',
        crawledAt: '2026-09-07T10:00:00.000Z',
        tickers: [],
        tags: [],
        isBackfillCandidate: false,
      },
    ]);
    const { loadLeadNews } = await import('@/lib/news/load-home');
    const { HOMEPAGE_NEWS_ROTATION_POOL } = await import('@/lib/news/homepage-rotation');
    const lead = await loadLeadNews();
    expect(lead.status).toBe('ok');
    expect(lead.article?.headline).toBe('Home lead');
    expect(lead.articles).toHaveLength(2);
    expect(getLatestNews).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        limit: HOMEPAGE_NEWS_ROTATION_POOL,
        orderBy: 'published',
        excludeBackfill: true,
        stockRelevantOnly: true,
      }),
    );
  });
});
