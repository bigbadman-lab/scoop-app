import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_NEWS_ROTATION_MS,
  HOMEPAGE_NEWS_ROTATION_POOL,
  HOMEPAGE_VISIBLE_NEWS_SLOTS,
  homepageArticlesSignature,
  nextHomepageNewsOffset,
  shouldRotateHomepageNews,
  visibleHomepageArticles,
} from '@/lib/news/homepage-rotation';

function articles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    providerArticleId: `id-${i + 1}`,
    headline: `Story ${i + 1}`,
  }));
}

describe('homepage news rotation helpers', () => {
  it('exposes a single 20s interval constant', () => {
    expect(HOMEPAGE_NEWS_ROTATION_MS).toBe(20_000);
    expect(HOMEPAGE_NEWS_ROTATION_POOL).toBeGreaterThanOrEqual(20);
    expect(HOMEPAGE_NEWS_ROTATION_POOL).toBeLessThanOrEqual(30);
    expect(HOMEPAGE_VISIBLE_NEWS_SLOTS).toBe(1);
  });

  it('does not rotate when pool fits visible slots', () => {
    expect(shouldRotateHomepageNews(0)).toBe(false);
    expect(shouldRotateHomepageNews(1)).toBe(false);
    expect(shouldRotateHomepageNews(5, 5)).toBe(false);
    expect(shouldRotateHomepageNews(6, 5)).toBe(true);
  });

  it('returns initial window without duplicates', () => {
    const pool = articles(10);
    expect(visibleHomepageArticles(pool, 0, 1).map((a) => a.providerArticleId)).toEqual([
      'id-1',
    ]);
    expect(visibleHomepageArticles(pool, 0, 5).map((a) => a.providerArticleId)).toEqual([
      'id-1',
      'id-2',
      'id-3',
      'id-4',
      'id-5',
    ]);
  });

  it('advances by slot count and wraps', () => {
    expect(nextHomepageNewsOffset(0, 10, 1)).toBe(1);
    expect(nextHomepageNewsOffset(9, 10, 1)).toBe(0);
    expect(nextHomepageNewsOffset(0, 12, 5)).toBe(5);
    expect(nextHomepageNewsOffset(10, 12, 5)).toBe(3);
  });

  it('handles uneven wrap without duplicate ids in a window', () => {
    const pool = articles(7);
    const offset = nextHomepageNewsOffset(5, 7, 5); // 5+5)%7 = 3
    const visible = visibleHomepageArticles(pool, offset, 5);
    const ids = visible.map((a) => a.providerArticleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['id-4', 'id-5', 'id-6', 'id-7', 'id-1']);
  });

  it('stops early rather than duplicating when pool < slots', () => {
    const pool = articles(2);
    expect(visibleHomepageArticles(pool, 0, 5).map((a) => a.providerArticleId)).toEqual([
      'id-1',
      'id-2',
    ]);
  });

  it('builds a stable signature for pool resets', () => {
    expect(homepageArticlesSignature(articles(2))).toBe('id-1|id-2');
  });
});
