import { describe, expect, it, vi } from 'vitest';
import { getLatestNews } from './query.js';
import type { Queryable } from '@scoop/db';

function mockDb(rows: Record<string, unknown>[]): Queryable {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      void params;
      return { rows, rowCount: rows.length, command: 'SELECT', sql };
    }),
  } as unknown as Queryable;
}

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

  it('applies stockRelevantOnly predicate for public feeds', async () => {
    const db = mockDb([]);
    await getLatestNews(db, { stockRelevantOnly: true, orderBy: 'published' });
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(sql).toContain('market_relevance_score');
    expect(sql).toContain("relevance_class <> 'reject'");
  });
});
