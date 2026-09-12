import { describe, expect, it } from 'vitest';
import {
  NEWS_INGEST_STALE_AFTER_MS,
  classifyNewsIngestHealth,
  formatNewsLastPull,
  formatNewsMarketStatusLabel,
} from '@/lib/news/ingest-freshness';

describe('news ingest freshness', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');

  it('uses a 30-minute stale threshold', () => {
    expect(NEWS_INGEST_STALE_AFTER_MS).toBe(30 * 60 * 1000);
  });

  it('marks LIVE below threshold and STALE beyond', () => {
    expect(
      classifyNewsIngestHealth(new Date(now - 8 * 60_000).toISOString(), now),
    ).toBe('live');
    expect(
      classifyNewsIngestHealth(new Date(now - 34 * 60_000).toISOString(), now),
    ).toBe('stale');
  });

  it('missing or invalid checkpoint is unavailable (not fake LIVE)', () => {
    expect(classifyNewsIngestHealth(null, now)).toBe('unavailable');
    expect(classifyNewsIngestHealth('', now)).toBe('unavailable');
    expect(classifyNewsIngestHealth('not-a-date', now)).toBe('unavailable');
  });

  it('formats Last pull relative copy', () => {
    expect(formatNewsLastPull(new Date(now - 20_000).toISOString(), now)).toBe(
      'Last pull now',
    );
    expect(formatNewsLastPull(new Date(now - 4 * 60_000).toISOString(), now)).toBe(
      'Last pull 4m ago',
    );
    expect(formatNewsLastPull(new Date(now - 2 * 3_600_000).toISOString(), now)).toBe(
      'Last pull 2h ago',
    );
    expect(formatNewsLastPull(null, now)).toBe('Last pull —');
  });

  it('formats singular/plural market status labels', () => {
    expect(formatNewsMarketStatusLabel(0)).toBe('NO LIVE MARKETS');
    expect(formatNewsMarketStatusLabel(1)).toBe('1 LIVE MARKET');
    expect(formatNewsMarketStatusLabel(2)).toBe('2 LIVE MARKETS');
  });
});
