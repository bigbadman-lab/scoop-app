import { describe, expect, it, vi } from 'vitest';
import {
  getNewsArticleLoreForToken,
  upsertNewsArticleMarketIntentAndLink,
} from './news-article-market-intents.js';
import type { Queryable } from '../types.js';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_NORM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DRAFT = '56eb7d5d-81a2-4d02-a353-718bfe42b8ae';
const PROVIDER = 'stocknewsapi';
const ARTICLE = 'sna_url_test_article';

function mockDb(handler: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('upsertNewsArticleMarketIntentAndLink', () => {
  it('persists pending intent when launch is not indexed yet', async () => {
    const intentRow = {
      id: 'intent-1',
      chain_id: 4663,
      token_address: TOKEN_NORM,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: DRAFT,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-14T00:00:00Z'),
      updated_at: new Date('2026-09-14T00:00:00Z'),
    };
    const db = mockDb((sql) => {
      if (sql.includes('FROM launch_drafts')) {
        return {
          rows: [
            {
              source_type: 'news',
              provider: PROVIDER,
              provider_article_id: ARTICLE,
            },
          ],
        };
      }
      if (sql.includes('FROM provider_news_articles')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        return { rows: [intentRow] };
      }
      if (sql.includes('FROM launches')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE news_article_market_intents') && sql.includes('attempts')) {
        return {
          rows: [{ ...intentRow, attempts: 1, last_error: 'launch_not_indexed' }],
        };
      }
      return { rows: [] };
    });

    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe(false);
      expect(result.intent.status).toBe('pending');
      expect(result.reason).toBe('launch_not_indexed');
    }
  });

  it('links immediately when launch is indexed', async () => {
    const intentRow = {
      id: 'intent-2',
      chain_id: 4663,
      token_address: TOKEN_NORM,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: DRAFT,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-14T00:00:00Z'),
      updated_at: new Date('2026-09-14T00:00:00Z'),
    };
    const db = mockDb((sql) => {
      if (sql.includes('FROM launch_drafts')) {
        return {
          rows: [
            {
              source_type: 'news',
              provider: PROVIDER,
              provider_article_id: ARTICLE,
            },
          ],
        };
      }
      if (sql.includes('FROM provider_news_articles')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        return { rows: [intentRow] };
      }
      if (sql.includes('FROM launches')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('INSERT INTO news_article_markets')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE news_article_market_intents') && sql.includes('status')) {
        return { rows: [{ ...intentRow, status: 'done' }] };
      }
      return { rows: [] };
    });

    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe(true);
      expect(result.intent.status).toBe('done');
    }
  });

  it('rejects invalid draft', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM launch_drafts')) {
        return { rows: [{ source_type: 'manual', provider: null, provider_article_id: null }] };
      }
      return { rows: [] };
    });
    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_draft' });
  });

  it('rejects draft/article mismatch', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM launch_drafts')) {
        return {
          rows: [
            {
              source_type: 'news',
              provider: PROVIDER,
              provider_article_id: ARTICLE,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
      providerArticleId: 'other_article',
    });
    expect(result).toEqual({ ok: false, reason: 'draft_article_mismatch' });
  });

  it('rejects missing article', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM provider_news_articles')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      provider: PROVIDER,
      providerArticleId: ARTICLE,
    });
    expect(result).toEqual({ ok: false, reason: 'article_not_found' });
  });

  it('does not silently repoint conflicting token link', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM provider_news_articles')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets')) {
        return {
          rows: [{ provider: PROVIDER, provider_article_id: 'other_article' }],
        };
      }
      return { rows: [] };
    });
    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      provider: PROVIDER,
      providerArticleId: ARTICLE,
    });
    expect(result).toEqual({ ok: false, reason: 'token_already_linked' });
  });

  it('is idempotent when already linked to same article', async () => {
    const intentRow = {
      id: 'intent-3',
      chain_id: 4663,
      token_address: TOKEN_NORM,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: null,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-14T00:00:00Z'),
      updated_at: new Date('2026-09-14T00:00:00Z'),
    };
    const db = mockDb((sql) => {
      if (sql.includes('FROM provider_news_articles')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets')) {
        return {
          rows: [{ provider: PROVIDER, provider_article_id: ARTICLE }],
        };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        return { rows: [intentRow] };
      }
      if (sql.includes('UPDATE news_article_market_intents')) {
        return { rows: [{ ...intentRow, status: 'done' }] };
      }
      return { rows: [] };
    });
    const result = await upsertNewsArticleMarketIntentAndLink(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      provider: PROVIDER,
      providerArticleId: ARTICLE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe(true);
      expect(result.reason).toBe('already_linked');
    }
  });
});

describe('getNewsArticleLoreForToken', () => {
  it('returns lore only from durable indexed link', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('FROM news_article_markets nam')) {
        return {
          rows: [
            {
              provider: PROVIDER,
              provider_article_id: ARTICLE,
              title: 'Headline',
              url: 'https://example.com/story',
              canonical_url: 'https://example.com/canonical',
              source_domain: 'example.com',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const lore = await getNewsArticleLoreForToken(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
    });
    expect(lore).toMatchObject({
      title: 'Headline',
      url: 'https://example.com/story',
      canonicalUrl: 'https://example.com/canonical',
      sourceDomain: 'example.com',
    });
  });

  it('returns null when no durable link', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const lore = await getNewsArticleLoreForToken(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
    });
    expect(lore).toBeNull();
  });
});
