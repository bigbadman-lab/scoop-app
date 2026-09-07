import { describe, expect, it } from 'vitest';
import {
  decodeNewsCursor,
  encodeNewsCursor,
  nextCursorFromItems,
  toPublicNewsItem,
  NEWS_UI_POLL_MS,
} from '@/lib/news/public';
import type { NewsFeedItem } from '@scoop/news';

const sample: NewsFeedItem = {
  providerArticleId: '42',
  headline: 'Hello',
  description: 'secret-ish',
  sourceDomain: 'reuters.com',
  url: 'https://reuters.com/a',
  publishedAt: '2026-09-07T12:00:00.000Z',
  crawledAt: '2026-09-07T12:01:00.000Z',
  tickers: ['NVDA'],
  tags: ['earnings'],
  isBackfillCandidate: false,
};

describe('public news helpers', () => {
  it('exposes a testable UI poll interval', () => {
    expect(NEWS_UI_POLL_MS).toBe(60_000);
  });

  it('maps public DTO without internal fields', () => {
    const pub = toPublicNewsItem(sample);
    expect(pub).toEqual({
      id: '42',
      headline: 'Hello',
      sourceDomain: 'reuters.com',
      url: 'https://reuters.com/a',
      publishedAt: '2026-09-07T12:00:00.000Z',
      tickers: ['NVDA'],
    });
    expect(JSON.stringify(pub)).not.toContain('isBackfillCandidate');
    expect(JSON.stringify(pub)).not.toContain('description');
    expect(JSON.stringify(pub)).not.toContain('crawledAt');
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
