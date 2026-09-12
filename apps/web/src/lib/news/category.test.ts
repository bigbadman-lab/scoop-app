import { describe, expect, it } from 'vitest';
import {
  NEWS_CATEGORY_COPY,
  newsCategoryHref,
  resolveNewsPageCategory,
} from '@/lib/news/category';

describe('news page category helpers', () => {
  it('defaults missing and invalid values to stocks (forgiving page UX)', () => {
    expect(resolveNewsPageCategory(undefined)).toBe('stocks');
    expect(resolveNewsPageCategory(null)).toBe('stocks');
    expect(resolveNewsPageCategory('')).toBe('stocks');
    expect(resolveNewsPageCategory('banana')).toBe('stocks');
    expect(resolveNewsPageCategory('STOCKS')).toBe('stocks');
    expect(resolveNewsPageCategory('markets')).toBe('markets');
    expect(resolveNewsPageCategory('Markets')).toBe('markets');
  });

  it('uses canonical shareable hrefs', () => {
    expect(newsCategoryHref('stocks')).toBe('/news');
    expect(newsCategoryHref('markets')).toBe('/news?category=markets');
  });

  it('exposes final category card copy', () => {
    expect(NEWS_CATEGORY_COPY.stocks).toEqual({
      label: 'Stocks',
      description: 'Stock-moving company news.',
    });
    expect(NEWS_CATEGORY_COPY.markets).toEqual({
      label: 'Markets',
      description: 'Macro, policy and events moving the tape.',
    });
  });
});
