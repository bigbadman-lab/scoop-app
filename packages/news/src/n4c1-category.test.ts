import { describe, expect, it, vi } from 'vitest';
import { getLatestNews } from './query.js';

/**
 * N4C.1 leakage elimination — category membership is authoritative.
 * Markets-only + macro_equity must NOT appear in Stocks.
 */
describe('N4C.1 category leakage predicates', () => {
  it('Stocks query requires stocks membership (not merely macro_equity quality)', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await getLatestNews({ query } as never, {
      category: 'stocks',
      stockRelevantOnly: true,
      excludeBackfill: true,
      orderBy: 'published',
    });
    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/feed_categories @>/);
    expect(params).toContain('stocks');
    expect(sql).toContain('market_relevance_score');
  });

  it('Markets query requires markets membership without inventing Stocks quality gate', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await getLatestNews({ query } as never, {
      category: 'markets',
      excludeBackfill: true,
      orderBy: 'published',
    });
    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/feed_categories @>/);
    expect(params).toContain('markets');
    expect(sql).not.toContain('market_relevance_score >= 20');
  });

  it('documents fixture expectations for dual/membership matrix', () => {
    // Article A stocks-only → stocks yes, markets no
    // Article B markets-only macro_equity → stocks no, markets yes
    // Article C dual → both yes
    const fixtures = [
      { id: 'A', cats: ['stocks'], inStocks: true, inMarkets: false },
      { id: 'B', cats: ['markets'], class: 'macro_equity', inStocks: false, inMarkets: true },
      { id: 'C', cats: ['stocks', 'markets'], inStocks: true, inMarkets: true },
    ];
    const stocks = fixtures.filter((f) => f.cats.includes('stocks')).map((f) => f.id);
    const markets = fixtures.filter((f) => f.cats.includes('markets')).map((f) => f.id);
    expect(stocks).toEqual(['A', 'C']);
    expect(markets).toEqual(['B', 'C']);
    expect(stocks).not.toContain('B');
  });
});
