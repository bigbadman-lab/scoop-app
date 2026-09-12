import { describe, expect, it, vi } from 'vitest';
import { addFeedCategory, mergeFeedCategories } from './feed-membership.js';
import { isMarketsNewsWriteEnabled } from './gate.js';
import { upsertProviderNewsArticles } from './repos/articles.js';
import { ingestMarketsOnce } from './markets-ingest.js';
import { createStockNewsClient } from './stocknews-client.js';
import { getLatestNews } from './query.js';
import { MARKETS_CHECKPOINT_PROVIDER } from './feed-category.js';
import type { ProviderNewsArticle } from './types.js';

function sampleArticle(
  overrides: Partial<ProviderNewsArticle> = {},
): ProviderNewsArticle {
  return {
    provider: 'stocknewsapi',
    providerArticleId: 'sna_1',
    title: 'Nvidia raises guidance',
    description: 'Company raised guidance',
    sourceDomain: 'example.com',
    url: 'https://example.com/nvda',
    canonicalUrl: 'https://example.com/nvda',
    imageUrl: 'https://cdn.example.com/a.png',
    providerPublishedAt: new Date('2026-09-08T14:00:00.000Z'),
    providerCrawledAt: new Date('2026-09-08T14:05:00.000Z'),
    providerTickers: ['NVDA'],
    providerTags: ['earnings'],
    crawlPublishLagSeconds: 300,
    isBackfillCandidate: false,
    contentHash: 'abc123',
    marketRelevanceScore: 80,
    relevanceClass: 'company',
    relevanceReasons: ['earnings'],
    feedCategories: ['stocks'],
    ...overrides,
  };
}

describe('feed membership helpers', () => {
  it('adds without duplicates and keeps stable order', () => {
    expect(addFeedCategory([], 'markets')).toEqual(['markets']);
    expect(addFeedCategory(['stocks'], 'markets')).toEqual(['stocks', 'markets']);
    expect(addFeedCategory(['markets', 'stocks'], 'stocks')).toEqual([
      'stocks',
      'markets',
    ]);
    expect(mergeFeedCategories(['stocks'], ['markets', 'stocks'])).toEqual([
      'stocks',
      'markets',
    ]);
  });
});

describe('isMarketsNewsWriteEnabled', () => {
  it('defaults off and fail-safes malformed values', () => {
    expect(isMarketsNewsWriteEnabled({})).toBe(false);
    expect(isMarketsNewsWriteEnabled({ SCOOP_MARKETS_NEWS_WRITE_ENABLED: '' })).toBe(
      false,
    );
    expect(isMarketsNewsWriteEnabled({ SCOOP_MARKETS_NEWS_WRITE_ENABLED: 'false' })).toBe(
      false,
    );
    expect(isMarketsNewsWriteEnabled({ SCOOP_MARKETS_NEWS_WRITE_ENABLED: 'nope' })).toBe(
      false,
    );
    expect(isMarketsNewsWriteEnabled({ SCOOP_MARKETS_NEWS_WRITE_ENABLED: 'true' })).toBe(
      true,
    );
    expect(isMarketsNewsWriteEnabled({ SCOOP_MARKETS_NEWS_WRITE_ENABLED: '1' })).toBe(
      true,
    );
  });
});

describe('upsert feed_categories merge semantics', () => {
  it('passes feed_categories and uses union SQL on conflict', async () => {
    const query = vi.fn(async () => ({ rows: [{ was_inserted: true }] }));
    await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({ feedCategories: ['markets'] }),
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/feed_categories/);
    expect(sql).toMatch(/unnest\(/);
    expect(sql).toMatch(/ARRAY\['stocks','markets'\]/);
    expect(params?.[18]).toEqual(['markets']);
  });

  it('dual membership survives repeated stocks then markets upserts (SQL contract)', async () => {
    // Simulate: first insert stocks, then markets merge, then stocks again — params always additive.
    const calls: unknown[][] = [];
    const query = vi.fn(async (_sql: string, params: unknown[] = []) => {
      calls.push(params);
      if (calls.length === 1) return { rows: [{ was_inserted: true }] };
      return { rows: [{ was_inserted: false }] };
    });

    await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({ feedCategories: ['stocks'] }),
    ]);
    await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({
        feedCategories: ['markets'],
        contentHash: 'abc123-changed',
        title: 'Nvidia raises guidance (markets touch)',
      }),
    ]);
    await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({ feedCategories: ['stocks'], contentHash: 'abc123-changed-2' }),
    ]);

    expect(calls[0]?.[18]).toEqual(['stocks']);
    expect(calls[1]?.[18]).toEqual(['markets']);
    expect(calls[2]?.[18]).toEqual(['stocks']);
    // ON CONFLICT union ensures DB ends as stocks+markets regardless of single-side payloads.
    expect(String(query.mock.calls[1]?.[0])).toMatch(
      /provider_news_articles\.feed_categories.*EXCLUDED\.feed_categories/s,
    );
  });
});

describe('ingestMarketsOnce write guard', () => {
  const now = new Date('2026-09-12T18:00:00Z');

  function clientWithArticles(
    rows: Array<Record<string, unknown>>,
  ) {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ data: rows, total_pages: 1, total_items: rows.length }),
        { status: 200 },
      );
    });
    return createStockNewsClient({
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
  }

  const freshFed = {
    title: 'Federal Reserve signals rate hike path at FOMC',
    news_url: 'https://example.com/fed',
    source_name: 'reuters.com',
    date: 'Sat, 12 Sep 2026 10:00:00 -0400',
    topics: [],
    sentiment: 'Neutral',
    type: 'Article',
    news_id: 1001,
    text: 'Interest rates may rise.',
  };

  const staleFed = {
    ...freshFed,
    news_id: 1002,
    news_url: 'https://example.com/old',
    date: 'Mon, 01 Sep 2025 10:00:00 -0400',
  };

  const stockPick = {
    title: 'Should You Buy Nvidia Stock Right Now?',
    news_url: 'https://example.com/nvda',
    source_name: 'fool.com',
    date: 'Sat, 12 Sep 2026 09:00:00 -0400',
    topics: [],
    type: 'Article',
    news_id: 1003,
    text: 'Opinion.',
  };

  it('writeEnabled=false never upserts or advances Markets checkpoint', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await ingestMarketsOnce({
      client: clientWithArticles([freshFed, stockPick, staleFed]),
      db: { query } as never,
      writeEnabled: false,
      now,
      lookupExisting: async (ids) => {
        const map = new Map();
        for (const id of ids) {
          map.set(id, { exists: false, feedCategories: [], stocksEligible: false });
        }
        return map;
      },
    });

    expect(result.writeEnabled).toBe(false);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.withinAgeWindow).toBe(2);
    expect(result.wouldInsert).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.checkpointAdvanced).toBe(false);
    // Read-only checkpoint SELECT is allowed for simulation reporting; no mutations.
    expect(
      query.mock.calls.some((c) => {
        const s = String(c[0]).trim().toUpperCase();
        return (
          s.startsWith('INSERT') ||
          s.startsWith('UPDATE') ||
          s.startsWith('DELETE') ||
          s.startsWith('ALTER')
        );
      }),
    ).toBe(false);
  });

  it('writeEnabled=true upserts accepted only and uses Markets checkpoint key', async () => {
    const sqls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes('INSERT INTO provider_news_articles')) {
        return { rows: [{ was_inserted: true }] };
      }
      if (sql.includes('news_ingestion_checkpoints') && sql.trim().startsWith('SELECT')) {
        return {
          rows: [
            {
              provider: MARKETS_CHECKPOINT_PROVIDER,
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
      return { rows: [] };
    });

    const result = await ingestMarketsOnce({
      client: clientWithArticles([freshFed, stockPick]),
      db: { query } as never,
      writeEnabled: true,
      now,
    });

    expect(result.success).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.checkpointAdvanced).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO provider_news_articles'))).toBe(true);
    expect(
      sqls.some(
        (s) =>
          s.includes('news_ingestion_checkpoints') &&
          s.includes('UPDATE'),
      ),
    ).toBe(true);
    // Checkpoint params use markets stream key
    const advanceCall = query.mock.calls.find(
      (c) => String(c[0]).includes('last_crawl_date') && String(c[0]).includes('UPDATE'),
    );
    expect(advanceCall?.[1]?.[0]).toBe(MARKETS_CHECKPOINT_PROVIDER);
  });

  it('rejected and stale articles are not persisted when writes enabled', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO provider_news_articles')) {
        return { rows: [{ was_inserted: true }] };
      }
      if (sql.includes('SELECT') && sql.includes('news_ingestion_checkpoints')) {
        return {
          rows: [
            {
              provider: MARKETS_CHECKPOINT_PROVIDER,
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
      return { rows: [] };
    });

    const result = await ingestMarketsOnce({
      client: clientWithArticles([stockPick, staleFed]),
      db: { query } as never,
      writeEnabled: true,
      now,
    });

    expect(result.accepted).toBe(0);
    expect(result.inserted).toBe(0);
    expect(
      query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO provider_news_articles')),
    ).toHaveLength(0);
  });
});

describe('public Stocks feed leakage risk (fixed in N4C.1)', () => {
  it('public Stocks path must pass category=stocks so Markets-only rows cannot leak', async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toMatch(/feed_categories @>/);
      expect(sql).toMatch(/market_relevance_score >= 20/);
      return { rows: [] };
    });

    await getLatestNews({ query } as never, {
      stockRelevantOnly: true,
      excludeBackfill: true,
      category: 'stocks',
      orderBy: 'published',
      limit: 10,
    });
    expect(query).toHaveBeenCalled();
  });
});


