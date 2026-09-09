import { describe, expect, it } from 'vitest';
import {
  decodeNewsCursor,
  encodeNewsCursor,
  nextCursorFromItems,
  toPublicNewsItem,
  truncateNewsSummary,
  NEWS_UI_POLL_MS,
} from '@/lib/news/public';
import type { NewsFeedItem } from '@scoop/news';

const sample: NewsFeedItem = {
  providerArticleId: '42',
  headline: 'Hello',
  description: 'secret-ish body that becomes a public summary',
  sourceDomain: 'reuters.com',
  url: 'https://reuters.com/a',
  publishedAt: '2026-09-07T12:00:00.000Z',
  crawledAt: '2026-09-07T12:01:00.000Z',
  tickers: ['NVDA'],
  tags: ['earnings'],
  isBackfillCandidate: false,
};

describe('public news helpers', () => {
  it('exposes a coordinated News poll interval under 10s', () => {
    expect(NEWS_UI_POLL_MS).toBe(8_000);
  });

  it('maps public DTO without internal fields and with markets defaults', () => {
    const pub = toPublicNewsItem(sample);
    expect(pub).toEqual({
      id: '42',
      headline: 'Hello',
      summary: 'secret-ish body that becomes a public summary',
      sourceDomain: 'reuters.com',
      url: 'https://reuters.com/a',
      publishedAt: '2026-09-07T12:00:00.000Z',
      tickers: ['NVDA'],
      marketCount: 0,
      markets: [],
    });
    expect(JSON.stringify(pub)).not.toContain('isBackfillCandidate');
    expect(JSON.stringify(pub)).not.toContain('crawledAt');
    expect(JSON.stringify(pub)).not.toContain('"description"');
  });

  it('attaches batched market summaries when provided', () => {
    const pub = toPublicNewsItem(sample, {
      marketCount: 2,
      markets: [
        {
          chainId: 4663,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          symbol: 'ABC',
          name: 'Abc',
          quoteAsset: '0x0000000000000000000000000000000000000000',
          launchedAt: 1,
          ageSeconds: 10,
          priceUsdDisplay: '1',
          fdvUsdDisplay: '2',
          volume24hUsdDisplay: null,
        },
      ],
    });
    expect(pub.marketCount).toBe(2);
    expect(pub.markets).toHaveLength(1);
    expect(pub.markets[0]!.symbol).toBe('ABC');
  });

  it('truncates long summaries', () => {
    const long = 'word '.repeat(80);
    const out = truncateNewsSummary(long);
    expect(out!.endsWith('…')).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(160);
  });

  it('round-trips cursors', () => {
    const encoded = encodeNewsCursor({
      at: sample.publishedAt,
      providerArticleId: sample.providerArticleId,
    });
    expect(decodeNewsCursor(encoded)).toEqual({
      at: sample.publishedAt,
      providerArticleId: '42',
    });
    expect(decodeNewsCursor('%%%')).toBeNull();
  });

  it('builds next cursor only for full pages', () => {
    expect(nextCursorFromItems([sample], 2)).toBeNull();
    const cursor = nextCursorFromItems([sample, { ...sample, providerArticleId: '41' }], 2);
    expect(decodeNewsCursor(cursor!)).toEqual({
      at: sample.publishedAt,
      providerArticleId: '41',
    });
  });
});
