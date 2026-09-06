import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizeUrl,
  computeContentHash,
  computeCrawlPublishLagSeconds,
  DEFAULT_BACKFILL_LAG_SECONDS,
  isBackfillCandidate,
  normalizeNewsDomain,
  normalizeProviderTags,
  normalizeProviderTickers,
  normalizeTiingoArticle,
  parseTiingoDate,
} from './normalize.js';
import {
  createTiingoNewsClient,
  sanitizeErrorMessage,
  TiingoNewsError,
  TIINGO_NEWS_ENDPOINT,
} from './tiingo-client.js';
import { isNewsPublicDisplayEnabled, assertNewsPublicDisplayAllowed } from './gate.js';
import { selectCatchupPage, normalizeBatch } from './ingest.js';
import type { ProviderNewsArticle } from './types.js';

function article(
  partial: Partial<ProviderNewsArticle> & { providerArticleId: string; crawl: string },
): ProviderNewsArticle {
  const crawled = new Date(partial.crawl);
  const published = partial.providerPublishedAt ?? new Date(crawled.getTime() - 60_000);
  return {
    provider: 'tiingo',
    providerArticleId: partial.providerArticleId,
    title: partial.title ?? 't',
    description: partial.description ?? null,
    sourceDomain: partial.sourceDomain ?? 'example.com',
    url: partial.url ?? 'https://example.com/a',
    canonicalUrl: null,
    providerPublishedAt: published,
    providerCrawledAt: crawled,
    providerTickers: partial.providerTickers ?? [],
    providerTags: partial.providerTags ?? [],
    crawlPublishLagSeconds: partial.crawlPublishLagSeconds ?? 60,
    isBackfillCandidate: partial.isBackfillCandidate ?? false,
    contentHash: partial.contentHash ?? 'abc',
  };
}

describe('normalizeNewsDomain', () => {
  it('strips scheme, path, and www', () => {
    expect(normalizeNewsDomain('https://www.reuters.com/world/foo')).toBe('reuters.com');
    expect(normalizeNewsDomain('https://finance.yahoo.com/news/x')).toBe('finance.yahoo.com');
    expect(normalizeNewsDomain('nytimes.com')).toBe('nytimes.com');
  });
});

describe('ticker / tag normalization', () => {
  it('uppercases and dedupes tickers', () => {
    expect(normalizeProviderTickers(['aapl', 'AAPL', ' tsla ', ''])).toEqual(['AAPL', 'TSLA']);
  });

  it('lowercases and dedupes tags', () => {
    expect(normalizeProviderTags(['Stock', 'stock', ' ETF '])).toEqual(['stock', 'etf']);
  });
});

describe('dates and lag', () => {
  it('parses tiingo dates', () => {
    const d = parseTiingoDate('2026-09-06T12:00:00.123456Z');
    expect(d?.toISOString()).toBe('2026-09-06T12:00:00.123Z');
  });

  it('computes crawl/publish lag and backfill rule', () => {
    const published = new Date('2026-09-06T10:00:00Z');
    const crawled = new Date('2026-09-06T17:00:00Z');
    const lag = computeCrawlPublishLagSeconds(crawled, published);
    expect(lag).toBe(7 * 3600);
    expect(isBackfillCandidate(lag, DEFAULT_BACKFILL_LAG_SECONDS)).toBe(true);
    expect(isBackfillCandidate(100, 21_600)).toBe(false);
    expect(isBackfillCandidate(null)).toBe(false);
  });
});

describe('normalizeTiingoArticle', () => {
  it('maps raw tiingo fields to canonical shape', () => {
    const a = normalizeTiingoArticle(
      {
        id: 104136013,
        title: '  Hello  ',
        description: '  body  ',
        url: 'https://www.reuters.com/foo?utm_source=x',
        publishedDate: '2026-09-06T10:00:00Z',
        crawlDate: '2026-09-06T10:05:00Z',
        source: 'reuters.com',
        tickers: ['aapl', 'AAPL'],
        tags: ['Stock'],
      },
      { backfillLagSeconds: 21_600 },
    );

    expect(a.provider).toBe('tiingo');
    expect(a.providerArticleId).toBe('104136013');
    expect(a.title).toBe('Hello');
    expect(a.description).toBe('body');
    expect(a.sourceDomain).toBe('reuters.com');
    expect(a.providerTickers).toEqual(['AAPL']);
    expect(a.providerTags).toEqual(['stock']);
    expect(a.crawlPublishLagSeconds).toBe(300);
    expect(a.isBackfillCandidate).toBe(false);
    expect(a.canonicalUrl).toBe('https://www.reuters.com/foo');
    expect(a.contentHash).toBe(
      computeContentHash({
        title: 'Hello',
        url: 'https://www.reuters.com/foo?utm_source=x',
        description: 'body',
      }),
    );
  });

  it('keeps same crawlDate different IDs distinct', () => {
    const shared = {
      title: 'Same',
      url: 'https://example.com/1',
      publishedDate: '2026-09-06T10:00:00Z',
      crawlDate: '2026-09-06T10:05:00Z',
      source: 'example.com',
      tickers: [] as string[],
      tags: [] as string[],
    };
    const a = normalizeTiingoArticle({ ...shared, id: 1 });
    const b = normalizeTiingoArticle({ ...shared, id: 2, url: 'https://example.com/2' });
    expect(a.providerArticleId).not.toBe(b.providerArticleId);
    expect(a.providerCrawledAt.getTime()).toBe(b.providerCrawledAt.getTime());
  });
});

describe('canonicalizeUrl', () => {
  it('returns null when no tracking params', () => {
    expect(canonicalizeUrl('https://example.com/a')).toBeNull();
  });
});

describe('public display gate', () => {
  it('defaults to false', () => {
    expect(isNewsPublicDisplayEnabled({})).toBe(false);
    expect(isNewsPublicDisplayEnabled({ SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'false' })).toBe(
      false,
    );
    expect(isNewsPublicDisplayEnabled({ SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true' })).toBe(true);
  });

  it('assert blocks when disabled', () => {
    expect(() => assertNewsPublicDisplayAllowed({})).toThrow(/disabled/i);
  });
});

describe('sanitizeErrorMessage', () => {
  it('redacts token and db urls', () => {
    const token = 'secret-token-value-xyz';
    const msg = sanitizeErrorMessage(
      `boom ${token} postgresql://user:pass@host/db Authorization: Token ${token}`,
      token,
    );
    expect(msg).not.toContain(token);
    expect(msg).not.toContain('user:pass');
    expect(msg).toContain('[REDACTED]');
  });
});

describe('tiingo client', () => {
  it('refuses bulk_download and uses header auth', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain(TIINGO_NEWS_ENDPOINT);
      expect(String(url)).not.toContain('bulk_download');
      expect(String(url)).not.toContain('secret');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Token secret');
      return new Response(
        JSON.stringify([
          {
            id: 1,
            title: 't',
            url: 'https://x.com',
            publishedDate: '2026-01-01T00:00:00Z',
            crawlDate: '2026-01-01T00:01:00Z',
            source: 'x.com',
            tickers: [],
            tags: [],
          },
        ]),
        { status: 200 },
      );
    });

    const client = createTiingoNewsClient({
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    const rows = await client.fetchNews({ limit: 1 });
    expect(rows).toHaveLength(1);
  });

  it('retries 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response('nope', { status: 429 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const sleep = vi.fn(async () => undefined);
    const client = createTiingoNewsClient({
      token: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
      maxRetries: 2,
    });
    await expect(client.fetchNews({ limit: 1 })).resolves.toEqual([]);
    expect(calls).toBe(2);
  });

  it('fails on non-retryable 400', async () => {
    const client = createTiingoNewsClient({
      token: 't',
      fetchImpl: (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch,
      maxRetries: 2,
      sleep: async () => undefined,
    });
    await expect(client.fetchNews()).rejects.toBeInstanceOf(TiingoNewsError);
  });
});

describe('catch-up selection', () => {
  it('stops at watermark and keeps only newer', () => {
    const watermark = new Date('2026-09-06T12:00:00Z');
    const page = [
      article({ providerArticleId: '3', crawl: '2026-09-06T13:00:00Z' }),
      article({ providerArticleId: '2', crawl: '2026-09-06T12:00:00Z' }),
      article({ providerArticleId: '1', crawl: '2026-09-06T11:00:00Z' }),
    ];
    const decision = selectCatchupPage({ articles: page, watermark });
    expect(decision.stop).toBe(true);
    expect(decision.toUpsert.map((a) => a.providerArticleId)).toEqual(['3']);
  });

  it('continues when entire page is newer', () => {
    const watermark = new Date('2026-09-06T10:00:00Z');
    const page = [
      article({ providerArticleId: '2', crawl: '2026-09-06T12:00:00Z' }),
      article({ providerArticleId: '1', crawl: '2026-09-06T11:00:00Z' }),
    ];
    const decision = selectCatchupPage({ articles: page, watermark });
    expect(decision.stop).toBe(false);
    expect(decision.toUpsert).toHaveLength(2);
  });

  it('first run takes one page then stops', () => {
    const page = [article({ providerArticleId: '1', crawl: '2026-09-06T12:00:00Z' })];
    const decision = selectCatchupPage({ articles: page, watermark: null });
    expect(decision.stop).toBe(true);
    expect(decision.toUpsert).toHaveLength(1);
  });
});

describe('normalizeBatch', () => {
  it('skips malformed rows', () => {
    const out = normalizeBatch(
      [
        {
          id: 1,
          title: 'ok',
          url: 'https://example.com',
          publishedDate: '2026-09-06T10:00:00Z',
          crawlDate: '2026-09-06T10:01:00Z',
          source: 'example.com',
        },
        { id: 2, title: '', url: '' },
      ],
      21_600,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.providerArticleId).toBe('1');
  });
});

describe('duplicate upsert key identity', () => {
  it('uses provider + string id', () => {
    const a = normalizeTiingoArticle({
      id: 99,
      title: 't',
      url: 'https://example.com/a',
      publishedDate: '2026-09-06T10:00:00Z',
      crawlDate: '2026-09-06T10:01:00Z',
      source: 'example.com',
    });
    const b = normalizeTiingoArticle({
      id: '99',
      title: 't2',
      url: 'https://example.com/b',
      publishedDate: '2026-09-06T10:00:00Z',
      crawlDate: '2026-09-06T10:02:00Z',
      source: 'example.com',
    });
    expect(a.provider).toBe(b.provider);
    expect(a.providerArticleId).toBe(b.providerArticleId);
  });
});

describe('checkpoint advancement semantics', () => {
  it('prefers safe overlap — same crawlDate keeps distinct IDs', () => {
    const watermark = new Date('2026-09-06T12:00:00.000Z');
    const page = [
      article({ providerArticleId: 'b', crawl: '2026-09-06T12:00:00.000Z' }),
      article({ providerArticleId: 'a', crawl: '2026-09-06T12:00:00.000Z' }),
    ];
    // Equal to watermark is not "newer" — safe overlap on next poll via upsert key
    const decision = selectCatchupPage({ articles: page, watermark });
    expect(decision.stop).toBe(true);
    expect(decision.toUpsert).toHaveLength(0);
  });
});
