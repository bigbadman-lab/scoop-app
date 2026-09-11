import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizeUrl,
  computeContentHash,
  normalizeNewsDomain,
  normalizeProviderTags,
  normalizeProviderTickers,
  normalizeStockNewsArticle,
  parseProviderDate,
  stockNewsArticleId,
  STOCKNEWS_PROVIDER,
} from './normalize.js';
import {
  createStockNewsClient,
  sanitizeErrorMessage,
  StockNewsApiError,
  STOCK_NEWS_API_BASE,
} from './stocknews-client.js';
import { classifyMentionInstrument, filterEquityMentions } from './instruments.js';
import { isNewsPublicDisplayEnabled, assertNewsPublicDisplayAllowed } from './gate.js';
import { normalizeBatch, normalizeBatchDetailed, ingestOnce } from './ingest.js';
import type { ProviderNewsArticle } from './types.js';

function article(
  partial: Partial<ProviderNewsArticle> & { providerArticleId: string },
): ProviderNewsArticle {
  const published = partial.providerPublishedAt ?? new Date('2026-09-08T12:00:00Z');
  return {
    provider: 'stocknewsapi',
    providerArticleId: partial.providerArticleId,
    title: partial.title ?? 't',
    description: partial.description ?? null,
    sourceDomain: partial.sourceDomain ?? 'example.com',
    url: partial.url ?? 'https://example.com/a',
    canonicalUrl: null,
    imageUrl: partial.imageUrl ?? null,
    providerPublishedAt: published,
    providerCrawledAt: partial.providerCrawledAt ?? published,
    providerTickers: partial.providerTickers ?? [],
    providerTags: partial.providerTags ?? [],
    crawlPublishLagSeconds: partial.crawlPublishLagSeconds ?? 60,
    isBackfillCandidate: partial.isBackfillCandidate ?? false,
    contentHash: partial.contentHash ?? 'abc',
  };
}

describe('normalize helpers', () => {
  it('strips domain noise', () => {
    expect(normalizeNewsDomain('https://www.reuters.com/world/foo')).toBe('reuters.com');
  });

  it('normalizes tickers/tags', () => {
    expect(normalizeProviderTickers(['aapl', 'AAPL'])).toEqual(['AAPL']);
    expect(normalizeProviderTags(['Stock', 'stock'])).toEqual(['stock']);
  });

  it('parses eastern provider dates', () => {
    const d = parseProviderDate('Tue, 08 Sep 2026 10:25:05 -0400');
    expect(d?.toISOString()).toBe('2026-09-08T14:25:05.000Z');
  });
});

describe('stockNewsArticleId', () => {
  it('prefers news_id when present', () => {
    expect(stockNewsArticleId({ news_id: 99, news_url: 'https://x.com/a' })).toBe('sna_99');
  });

  it('hashes url when id missing', () => {
    const a = stockNewsArticleId({ news_url: 'https://example.com/story?utm_source=x' });
    const b = stockNewsArticleId({ news_url: 'https://example.com/story' });
    expect(a).toMatch(/^sna_url_/);
    expect(a).toBe(b);
  });
});

describe('normalizeStockNewsArticle', () => {
  it('maps SNA fields to canonical shape', () => {
    const a = normalizeStockNewsArticle({
      title: ' Intel Climbs 5% on High-NA EUV ',
      text: ' ASML and TSM advanced ',
      news_url: 'https://247wallst.com/foo?utm_source=x',
      image_url: 'https://cdn.example.com/i.jpg',
      source_name: 'reuters.com',
      date: 'Tue, 08 Sep 2026 09:32:21 -0400',
      tickers: ['intc', 'ASML'],
      topics: ['Earnings'],
      sentiment: 'Positive',
      type: 'Article',
      news_id: 'abc123',
    });
    expect(a.provider).toBe(STOCKNEWS_PROVIDER);
    expect(a.providerArticleId).toBe('sna_abc123');
    expect(a.title).toBe('Intel Climbs 5% on High-NA EUV');
    expect(a.imageUrl).toBe('https://cdn.example.com/i.jpg');
    expect(a.providerTickers).toEqual(['INTC', 'ASML']);
    expect(a.providerTags).toEqual(['earnings', 'positive']);
    expect(a.canonicalUrl).toBe('https://247wallst.com/foo');
    expect(a.contentHash).toBe(
      computeContentHash({
        title: 'Intel Climbs 5% on High-NA EUV',
        url: 'https://247wallst.com/foo?utm_source=x',
        description: 'ASML and TSM advanced',
      }),
    );
  });
});

describe('equity instrument filter', () => {
  it('drops ETFs/funds and keeps companies', () => {
    const { equities, removed } = filterEquityMentions([
      { ticker: 'XOP', name: 'SPDR S&P Oil & Gas Explor & Prodtn ETF' },
      { ticker: 'SPY', name: 'SPDR S&P 500 ETF' },
      { ticker: 'NVDA', name: 'NVIDIA Corporation' },
      { ticker: 'AMZN', name: 'Amazon.com, Inc.' },
    ]);
    expect(equities.map((e) => e.ticker)).toEqual(['NVDA', 'AMZN']);
    expect(removed.map((e) => e.ticker)).toEqual(['XOP', 'SPY']);
    expect(classifyMentionInstrument({ ticker: 'USO', name: 'United States Oil Fund, LP' })).toBe(
      'non_equity',
    );
  });
});

describe('stock news client', () => {
  it('omits token from thrown messages and hits documented endpoints', async () => {
    const token = 'secret-token-value-xyz';
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain(STOCK_NEWS_API_BASE);
      expect(String(url)).toContain('token=');
      if (String(url).includes('/top-mention')) {
        return new Response(
          JSON.stringify({
            data: {
              all: [
                {
                  ticker: 'NVDA',
                  name: 'NVIDIA Corporation',
                  total_mentions: 12,
                  positive_mentions: 10,
                  negative_mentions: 2,
                  neutral_mentions: 0,
                  sentiment_score: 0.8,
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              title: 'Nvidia rises on AI demand',
              news_url: 'https://example.com/n',
              source_name: 'Example',
              date: 'Tue, 08 Sep 2026 10:00:00 -0400',
              tickers: ['NVDA'],
              type: 'Article',
              text: 'outlook raised',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const client = createStockNewsClient({
      token,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    const mentions = await client.fetchTopMentions({ date: 'today' });
    expect(mentions[0]?.ticker).toBe('NVDA');
    const news = await client.fetchTickerNews({
      tickers: ['NVDA'],
      items: 3,
      type: 'article',
      date: 'today',
    });
    expect(news).toHaveLength(1);

    await expect(
      createStockNewsClient({
        token,
        fetchImpl: (async () =>
          new Response(JSON.stringify({ message: `bad ${token}` }), {
            status: 400,
          })) as unknown as typeof fetch,
        maxRetries: 0,
      }).fetchTickerNews({ tickers: ['AAPL'], items: 3 }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(StockNewsApiError);
      expect(String((err as Error).message)).not.toContain(token);
      return true;
    });
  });
});

describe('sanitizeErrorMessage', () => {
  it('redacts token and db urls', () => {
    const token = 'secret-token-value-xyz';
    const msg = sanitizeErrorMessage(
      `boom ${token} postgresql://user:pass@host/db token=${token}`,
      token,
    );
    expect(msg).not.toContain(token);
    expect(msg).not.toContain('user:pass');
  });
});

describe('public display gate', () => {
  it('defaults to false', () => {
    expect(isNewsPublicDisplayEnabled({})).toBe(false);
    expect(isNewsPublicDisplayEnabled({ SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true' })).toBe(true);
  });

  it('assert blocks when disabled', () => {
    expect(() => assertNewsPublicDisplayAllowed({})).toThrow(/disabled/i);
  });
});

describe('normalizeBatch', () => {
  it('skips malformed rows and reports skip details', () => {
    const skips: Array<{ reason: string }> = [];
    const out = normalizeBatchDetailed(
      [
        {
          title: 'ok',
          news_url: 'https://example.com',
          date: 'Tue, 08 Sep 2026 10:00:00 -0400',
          source_name: 'example.com',
          tickers: ['AAPL'],
        },
        { title: '', news_url: '' },
      ],
      21_600,
      (skip) => skips.push(skip),
    );
    expect(out.articles).toHaveLength(1);
    expect(out.skipped).toHaveLength(1);
    expect(skips).toHaveLength(1);
    expect(normalizeBatch([{ title: '', news_url: '' }], 21_600)).toEqual([]);
  });
});

describe('ingestOnce', () => {
  it('filters equities, upserts accepted only, leaves DB on provider failure', async () => {
    const queries: string[] = [];
    const db = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('INSERT INTO provider_news_articles')) {
          return { rows: [{ was_inserted: true }], rowCount: 1 };
        }
        if (sql.includes('news_ingestion_checkpoints') && sql.trim().startsWith('SELECT')) {
          return {
            rows: [
              {
                provider: 'stocknewsapi',
                last_crawl_date: null,
                last_provider_article_id: null,
                last_success_at: null,
                last_attempt_at: null,
                last_error: null,
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const client = {
      endpoint: STOCK_NEWS_API_BASE,
      fetchTopMentions: async () => [
        { ticker: 'XOP', name: 'SPDR Oil ETF', totalMentions: 10, positiveMentions: 1, negativeMentions: 0, neutralMentions: 0, sentimentScore: 0.1 },
        { ticker: 'NVDA', name: 'NVIDIA Corporation', totalMentions: 12, positiveMentions: 10, negativeMentions: 2, neutralMentions: 0, sentimentScore: 0.8 },
      ],
      fetchTickerNews: async () => [
        {
          title: 'Nvidia raises guidance after strong earnings',
          news_url: 'https://example.com/nvda-earnings',
          source_name: 'Example',
          date: 'Tue, 08 Sep 2026 10:00:00 -0400',
          tickers: ['NVDA'],
          text: 'Company raised guidance',
          type: 'Article',
          news_id: '1',
        },
        {
          title: 'Forget NVDA: This AI Hardware Stock Is the Smarter Bet Right Now',
          news_url: 'https://example.com/opinion',
          source_name: 'Example',
          date: 'Tue, 08 Sep 2026 10:01:00 -0400',
          tickers: ['NVDA'],
          type: 'Article',
          news_id: '2',
        },
      ],
    };

    const result = await ingestOnce({
      db: db as never,
      client,
      itemsPerCall: 3,
      batchSize: 8,
    });

    expect(result.topMentions).toBe(2);
    expect(result.equitiesRetained).toBe(1);
    expect(result.nonEquitiesRemoved).toBe(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.success).toBe(true);
    expect(result.fetchWindowStrategy).toMatch(/overlap=deliberate/);
    expect(result.newestPublishedAt).toBeTruthy();
    expect(queries.some((q) => q.includes('INSERT INTO provider_news_articles'))).toBe(true);

    const fail = await ingestOnce({
      db: db as never,
      client: {
        endpoint: STOCK_NEWS_API_BASE,
        fetchTopMentions: async () => {
          throw new Error('upstream down');
        },
        fetchTickerNews: async () => [],
      },
    });
    expect(fail.stoppedReason).toBe('error');
    expect(fail.upserted).toBe(0);
  });

  it('dedupes same url across batches via upsert key', async () => {
    const keys = new Set<string>();
    const db = {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('INSERT INTO provider_news_articles')) {
          keys.add(`${params[0]}:${params[1]}`);
          return { rows: [{ was_inserted: keys.size === 1 }], rowCount: 1 };
        }
        if (sql.includes('news_ingestion_checkpoints') && sql.trim().startsWith('SELECT')) {
          return {
            rows: [
              {
                provider: 'stocknewsapi',
                last_crawl_date: null,
                last_provider_article_id: null,
                last_success_at: null,
                last_attempt_at: null,
                last_error: null,
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const { upsertProviderNewsArticles } = await import('./repos/articles.js');
    const row = article({
      providerArticleId: 'sna_1',
      title: 'Apple reports quarterly earnings above estimates',
      providerTickers: ['AAPL'],
      marketRelevanceScore: 55,
      relevanceClass: 'company',
      relevanceReasons: ['equity_event'],
    });
    await upsertProviderNewsArticles(db as never, [row]);
    await upsertProviderNewsArticles(db as never, [row]);
    expect(keys.size).toBe(1);
  });
});

describe('canonicalizeUrl', () => {
  it('returns null when no tracking params', () => {
    expect(canonicalizeUrl('https://example.com/a')).toBeNull();
  });
});
