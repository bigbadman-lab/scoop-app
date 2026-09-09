import { describe, expect, it, vi } from 'vitest';
import { linkNewsArticleMarket, resolveArticleFromDraft } from '../repos/news-article-markets.js';
import { getNewsArticleMarketsForArticles, listNewsArticleMarkets } from './news-article-markets.js';

function mockDb(handler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => handler(sql, params)),
  };
}

describe('linkNewsArticleMarket', () => {
  it('refuses when launch is not indexed', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM launches')) return { rows: [] };
      return { rows: [] };
    });
    const result = await linkNewsArticleMarket(db as never, {
      provider: 'stocknewsapi',
      providerArticleId: 'sna_1',
      chainId: 4663,
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    });
    expect(result).toEqual({ linked: false, reason: 'launch_not_indexed' });
  });

  it('inserts once when launch + article exist (idempotent conflict)', async () => {
    const inserts: string[] = [];
    const db = mockDb((sql) => {
      if (sql.includes('FROM launches')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM provider_news_articles')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('INSERT INTO news_article_markets')) {
        inserts.push(sql);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });
    const a = await linkNewsArticleMarket(db as never, {
      provider: 'stocknewsapi',
      providerArticleId: 'sna_1',
      chainId: 4663,
      tokenAddress: '0x2284ED0E4D446C6D78AC2D49A68BAE822FD87373',
      draftId: '11111111-1111-1111-1111-111111111111',
    });
    const b = await linkNewsArticleMarket(db as never, {
      provider: 'stocknewsapi',
      providerArticleId: 'sna_1',
      chainId: 4663,
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    });
    expect(a.linked).toBe(true);
    expect(b.linked).toBe(true);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatch(/ON CONFLICT \(chain_id, token_address\) DO NOTHING/);
  });
});

describe('resolveArticleFromDraft', () => {
  it('returns article only for news drafts', async () => {
    const db = mockDb(() => ({
      rows: [
        {
          source_type: 'news',
          provider: 'stocknewsapi',
          provider_article_id: 'sna_9',
        },
      ],
    }));
    await expect(resolveArticleFromDraft(db as never, 'd1')).resolves.toEqual({
      provider: 'stocknewsapi',
      providerArticleId: 'sna_9',
    });
  });

  it('returns null for standard drafts', async () => {
    const db = mockDb(() => ({
      rows: [{ source_type: 'standard', provider: null, provider_article_id: null }],
    }));
    await expect(resolveArticleFromDraft(db as never, 'd1')).resolves.toBeNull();
  });
});

describe('getNewsArticleMarketsForArticles', () => {
  it('batches many articles without per-id queries and maps 0/1/3 markets', async () => {
    const db = mockDb((sql, params) => {
      expect(sql).toContain('news_article_markets');
      expect(params?.[1]).toEqual(['a', 'b', 'c']);
      return {
        rows: [
          {
            provider_article_id: 'a',
            chain_id: 4663,
            token_address: '0x1111111111111111111111111111111111111111',
            symbol: 'ONE',
            name: 'One',
            quote_asset: '0x0000000000000000000000000000000000000000',
            launched_at: 100,
            age_seconds: 10,
            price_usd_x18: '1000000000000000000',
            fdv_usd_x18: '2000000000000000000',
            volume_24h_usd_x18: null,
            market_count: 1,
          },
          {
            provider_article_id: 'c',
            chain_id: 4663,
            token_address: '0x2222222222222222222222222222222222222222',
            symbol: 'C3',
            name: 'C Three',
            quote_asset: '0x0000000000000000000000000000000000000000',
            launched_at: 300,
            age_seconds: 3,
            price_usd_x18: null,
            fdv_usd_x18: null,
            volume_24h_usd_x18: null,
            market_count: 3,
          },
          {
            provider_article_id: 'c',
            chain_id: 4663,
            token_address: '0x3333333333333333333333333333333333333333',
            symbol: 'C2',
            name: 'C Two',
            quote_asset: '0x0000000000000000000000000000000000000000',
            launched_at: 200,
            age_seconds: 4,
            price_usd_x18: null,
            fdv_usd_x18: null,
            volume_24h_usd_x18: null,
            market_count: 3,
          },
          {
            provider_article_id: 'c',
            chain_id: 4663,
            token_address: '0x4444444444444444444444444444444444444444',
            symbol: 'C1',
            name: 'C One',
            quote_asset: '0x0000000000000000000000000000000000000000',
            launched_at: 100,
            age_seconds: 5,
            price_usd_x18: null,
            fdv_usd_x18: null,
            volume_24h_usd_x18: null,
            market_count: 3,
          },
        ],
      };
    });

    const map = await getNewsArticleMarketsForArticles(db as never, {
      provider: 'stocknewsapi',
      providerArticleIds: ['a', 'b', 'c'],
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(map.get('a')?.marketCount).toBe(1);
    expect(map.get('a')?.markets[0]?.symbol).toBe('ONE');
    expect(map.get('b')?.marketCount).toBe(0);
    expect(map.get('b')?.markets).toEqual([]);
    expect(map.get('c')?.marketCount).toBe(3);
    expect(map.get('c')?.markets).toHaveLength(3);
  });
});

describe('listNewsArticleMarkets', () => {
  it('returns newest-first list for one article', async () => {
    const db = mockDb(() => ({
      rows: [
        {
          provider_article_id: 'sna_1',
          chain_id: 4663,
          token_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          symbol: 'NEW',
          name: 'New',
          quote_asset: '0x0000000000000000000000000000000000000000',
          launched_at: 200,
          age_seconds: 1,
          price_usd_x18: null,
          fdv_usd_x18: null,
          volume_24h_usd_x18: null,
        },
      ],
    }));
    const rows = await listNewsArticleMarkets(db as never, {
      provider: 'stocknewsapi',
      providerArticleId: 'sna_1',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.symbol).toBe('NEW');
  });
});
