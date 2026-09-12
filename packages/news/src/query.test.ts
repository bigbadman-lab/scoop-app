import { describe, expect, it, vi } from 'vitest';
import { getLatestNews, STOCKS_PUBLIC_QUALITY_SQL } from './query.js';
import { parseNewsFeedCategory } from './feed-category.js';
import type { Queryable } from '@scoop/db';

function mockDb(rows: Record<string, unknown>[]): Queryable {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      void params;
      return { rows, rowCount: rows.length, command: 'SELECT', sql };
    }),
  } as unknown as Queryable;
}

describe('parseNewsFeedCategory', () => {
  it('defaults missing to stocks', () => {
    expect(parseNewsFeedCategory(undefined)).toEqual({
      ok: true,
      category: 'stocks',
      defaulted: true,
    });
    expect(parseNewsFeedCategory(null)).toEqual({
      ok: true,
      category: 'stocks',
      defaulted: true,
    });
  });

  it('accepts stocks and markets case-insensitively', () => {
    expect(parseNewsFeedCategory('stocks')).toMatchObject({
      ok: true,
      category: 'stocks',
      defaulted: false,
    });
    expect(parseNewsFeedCategory('MARKETS')).toMatchObject({
      ok: true,
      category: 'markets',
      defaulted: false,
    });
  });

  it('rejects empty and unknown values', () => {
    expect(parseNewsFeedCategory('')).toMatchObject({ ok: false });
    expect(parseNewsFeedCategory('foobar')).toMatchObject({ ok: false });
  });
});

describe('getLatestNews', () => {
  it('orders by published when requested and maps DTO fields', async () => {
    const db = mockDb([
      {
        provider_article_id: '2',
        title: 'Newer publish',
        description: null,
        source_domain: 'example.com',
        url: 'https://example.com/a',
        provider_published_at: '2026-09-07T12:00:00.000Z',
        provider_crawled_at: '2026-09-07T10:00:00.000Z',
        provider_tickers: ['AAPL'],
        provider_tags: null,
        is_backfill_candidate: false,
      },
    ]);
    const items = await getLatestNews(db, {
      limit: 10,
      excludeBackfill: true,
      orderBy: 'published',
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.headline).toBe('Newer publish');
    expect(items[0]?.publishedAt).toBe('2026-09-07T12:00:00.000Z');
    expect(items[0]?.tickers).toEqual(['AAPL']);
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(sql).toContain('ORDER BY provider_published_at DESC');
    expect(sql).toContain('is_backfill_candidate = FALSE');
  });

  it('applies keyset cursor for pagination', async () => {
    const db = mockDb([]);
    await getLatestNews(db, {
      limit: 5,
      orderBy: 'published',
      cursor: {
        at: '2026-09-07T12:00:00.000Z',
        providerArticleId: '99',
      },
    });
    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = String(call?.[0]);
    const params = call?.[1] as unknown[];
    expect(sql).toContain('(provider_published_at, provider_article_id) <');
    expect(params).toContain('2026-09-07T12:00:00.000Z');
    expect(params).toContain('99');
    expect(params).toContain(5);
  });

  it('clamps limit', async () => {
    const db = mockDb([]);
    await getLatestNews(db, { limit: 9999 });
    const params = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown[];
    expect(params?.[params.length - 1]).toBe(500);
  });

  it('applies stockRelevantOnly quality predicate', async () => {
    const db = mockDb([]);
    await getLatestNews(db, { stockRelevantOnly: true, orderBy: 'published' });
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(sql).toContain('market_relevance_score');
    expect(sql).toContain("relevance_class <> 'reject'");
    expect(sql).toContain(STOCKS_PUBLIC_QUALITY_SQL.slice(0, 40));
  });

  it('filters by feed_categories for stocks and markets', async () => {
    const db = mockDb([]);
    await getLatestNews(db, {
      category: 'stocks',
      stockRelevantOnly: true,
      excludeBackfill: true,
      orderBy: 'published',
    });
    const stocksCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(stocksCall?.[0])).toMatch(/feed_categories @> ARRAY\[\$\d+\]::text\[\]/);
    expect(stocksCall?.[1]).toContain('stocks');

    await getLatestNews(db, {
      category: 'markets',
      excludeBackfill: true,
      orderBy: 'published',
    });
    const marketsCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(String(marketsCall?.[0])).toMatch(/feed_categories @> ARRAY\[\$\d+\]::text\[\]/);
    expect(marketsCall?.[1]).toContain('markets');
    expect(String(marketsCall?.[0])).not.toContain('market_relevance_score >= 20');
  });

  it('keeps category filter present with cursor (pagination isolation)', async () => {
    const db = mockDb([]);
    await getLatestNews(db, {
      category: 'markets',
      excludeBackfill: true,
      orderBy: 'published',
      cursor: { at: '2026-09-12T12:00:00.000Z', providerArticleId: 'sna_1' },
    });
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    const params = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/feed_categories @>/);
    expect(params).toContain('markets');
    expect(sql).toContain('(provider_published_at, provider_article_id) <');
  });
});
