import { describe, expect, it } from 'vitest';
import {
  classifyNewsFreshness,
  isNewsFresh,
  NEWS_JUST_IN_MS,
  NEWS_NEW_MS,
  NEWS_RECENT_MS,
} from '@/lib/news/freshness';

describe('classifyNewsFreshness', () => {
  const now = Date.parse('2026-09-08T16:00:00.000Z');

  it('marks just-in / new / recent / older windows', () => {
    expect(
      classifyNewsFreshness(new Date(now - NEWS_JUST_IN_MS + 1_000).toISOString(), now),
    ).toBe('just_in');
    expect(
      classifyNewsFreshness(new Date(now - 30 * 60_000).toISOString(), now),
    ).toBe('new');
    expect(
      classifyNewsFreshness(new Date(now - 3 * 60 * 60_000).toISOString(), now),
    ).toBe('recent');
    expect(
      classifyNewsFreshness(new Date(now - NEWS_RECENT_MS - 1_000).toISOString(), now),
    ).toBe('older');
  });

  it('treats just_in and new as fresh', () => {
    expect(isNewsFresh('just_in')).toBe(true);
    expect(isNewsFresh('new')).toBe(true);
    expect(isNewsFresh('recent')).toBe(false);
    expect(isNewsFresh('older')).toBe(false);
  });

  it('keeps NEW under one hour', () => {
    expect(
      classifyNewsFreshness(new Date(now - NEWS_NEW_MS + 1_000).toISOString(), now),
    ).toBe('new');
    expect(
      classifyNewsFreshness(new Date(now - NEWS_NEW_MS - 1_000).toISOString(), now),
    ).toBe('recent');
  });
});
