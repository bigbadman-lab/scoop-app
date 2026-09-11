import { describe, expect, it, vi } from 'vitest';
import { upsertProviderNewsArticles } from './articles.js';
import type { ProviderNewsArticle } from '../types.js';

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
    relevanceClass: 'strong',
    relevanceReasons: ['earnings'],
    ...overrides,
  };
}

describe('upsertProviderNewsArticles', () => {
  it('counts inserts and is idempotent for the same provider article id', async () => {
    const keys: string[] = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO provider_news_articles')) {
        keys.push(`${params[0]}:${params[1]}`);
        // First call insert, second call conflict with no field change → empty RETURNING
        if (keys.length === 1) return { rows: [{ was_inserted: true }] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await upsertProviderNewsArticles({ query } as never, [
      sampleArticle(),
    ]);
    const second = await upsertProviderNewsArticles({ query } as never, [
      sampleArticle(),
    ]);

    expect(first.inserted).toBe(1);
    expect(first.updated).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(second.inserted).toBe(0);
    expect(keys).toEqual(['stocknewsapi:sna_1', 'stocknewsapi:sna_1']);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/ON CONFLICT \(provider, provider_article_id\)/);
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /COALESCE\(NULLIF\(EXCLUDED\.title, ''\)/,
    );
  });

  it('does not pass empty title/image as erase payload — SQL uses COALESCE', async () => {
    const query = vi.fn(async () => ({ rows: [{ was_inserted: false }] }));
    await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({
        description: null,
        imageUrl: null,
        providerTickers: [],
        providerTags: [],
      }),
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/description = COALESCE\(EXCLUDED\.description/);
    expect(sql).toMatch(/image_url = COALESCE\(EXCLUDED\.image_url/);
    expect(sql).toMatch(/cardinality\(EXCLUDED\.provider_tickers\) > 0/);
  });

  it('counts updates when RETURNING marks a non-insert row', async () => {
    const query = vi.fn(async () => ({ rows: [{ was_inserted: false }] }));
    const stats = await upsertProviderNewsArticles({ query } as never, [
      sampleArticle({ title: 'Nvidia raises guidance (updated)', contentHash: 'def' }),
    ]);
    expect(stats.updated).toBe(1);
    expect(stats.inserted).toBe(0);
    expect(stats.unchanged).toBe(0);
  });
});
