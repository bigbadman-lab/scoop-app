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

describe('ensureNewsArticleMarketFromTrustedDraft', () => {
  it('no-ops without draftId', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const { ensureNewsArticleMarketFromTrustedDraft } = await import(
      './news-article-market-intents.js'
    );
    const result = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: null,
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: 'no_draft' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('no-ops for non-news draft', async () => {
    const { ensureNewsArticleMarketFromTrustedDraft } = await import(
      './news-article-market-intents.js'
    );
    const db = mockDb((sql) => {
      if (sql.includes('FROM launch_drafts')) {
        return {
          rows: [
            {
              source_type: 'standard',
              provider: null,
              provider_article_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const result = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: 'not_news_draft',
    });
  });

  it('C1/C5/C6: news draft + launched token creates intent/link and lore', async () => {
    const { ensureNewsArticleMarketFromTrustedDraft, getNewsArticleLoreForToken } =
      await import('./news-article-market-intents.js');
    const intentRow = {
      id: 'intent-zhang',
      chain_id: 4663,
      token_address: TOKEN_NORM,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: DRAFT,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-15T00:00:00Z'),
      updated_at: new Date('2026-09-15T00:00:00Z'),
    };
    let namInserted = false;
    let intentStatus = 'pending';
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
      if (sql.includes('FROM provider_news_articles') && sql.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets') && sql.includes('SELECT provider')) {
        return namInserted
          ? {
              rows: [
                { provider: PROVIDER, provider_article_id: ARTICLE },
              ],
            }
          : { rows: [] };
      }
      if (sql.includes('FROM launches')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        return { rows: [{ ...intentRow, status: intentStatus }] };
      }
      if (sql.includes('INSERT INTO news_article_markets')) {
        namInserted = true;
        return { rows: [] };
      }
      if (sql.includes('UPDATE news_article_market_intents') && sql.includes('status')) {
        intentStatus = 'done';
        return { rows: [{ ...intentRow, status: 'done' }] };
      }
      if (sql.includes('FROM news_article_markets nam')) {
        return {
          rows: [
            {
              provider: PROVIDER,
              provider_article_id: ARTICLE,
              title: 'Legend Biotech taps Novartis veteran Zhang as CEO',
              url: 'https://www.reuters.com/example',
              canonical_url: null,
              source_domain: 'reuters.com',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const ensured = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    expect(ensured.ok).toBe(true);
    if (!ensured.ok || ensured.skipped) throw new Error('expected news ensure');
    expect(ensured.linked).toBe(true);
    expect(ensured.intent.status).toBe('done');

    const lore = await getNewsArticleLoreForToken(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
    });
    expect(lore).toMatchObject({
      title: 'Legend Biotech taps Novartis veteran Zhang as CEO',
      sourceDomain: 'reuters.com',
    });
  });

  it('C3: repeated ensure is idempotent for already-linked token', async () => {
    const { ensureNewsArticleMarketFromTrustedDraft } = await import(
      './news-article-market-intents.js'
    );
    const intentRow = {
      id: 'intent-1',
      chain_id: 4663,
      token_address: TOKEN_NORM,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: DRAFT,
      status: 'done' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-15T00:00:00Z'),
      updated_at: new Date('2026-09-15T00:00:00Z'),
    };
    let insertCount = 0;
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
      if (sql.includes('FROM news_article_markets') && sql.includes('SELECT provider')) {
        return {
          rows: [{ provider: PROVIDER, provider_article_id: ARTICLE }],
        };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        insertCount += 1;
        return { rows: [intentRow] };
      }
      return { rows: [] };
    });

    const first = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    const second = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    expect(first.ok && !first.skipped && first.linked).toBe(true);
    expect(second.ok && !second.skipped && second.linked).toBe(true);
    expect(insertCount).toBe(2); // upsert ON CONFLICT; no duplicate market rows
  });

  it('C4: conflicting existing link fails safely', async () => {
    const { ensureNewsArticleMarketFromTrustedDraft } = await import(
      './news-article-market-intents.js'
    );
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
      if (sql.includes('FROM news_article_markets') && sql.includes('SELECT provider')) {
        return {
          rows: [
            {
              provider: PROVIDER,
              provider_article_id: 'other_article',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const result = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: DRAFT,
    });
    expect(result).toEqual({ ok: false, reason: 'token_already_linked' });
  });

  it('Solana mint: news draft creates nam link and lore with base58 preserved', async () => {
    const { ensureNewsArticleMarketFromTrustedDraft, getNewsArticleLoreForToken } =
      await import('./news-article-market-intents.js');
    const SOL_MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
    const SOLANA_CHAIN = 900001;
    const HEADLINE = 'Markets react to rate decision';
    const SOURCE = 'reuters.com';
    const URL = 'https://reuters.com/a';
    const intentRow = {
      id: 'intent-sol',
      chain_id: SOLANA_CHAIN,
      token_address: SOL_MINT,
      provider: PROVIDER,
      provider_article_id: ARTICLE,
      draft_id: DRAFT,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
      created_at: new Date('2026-09-21T00:00:00Z'),
      updated_at: new Date('2026-09-21T00:00:00Z'),
    };
    let namInserted = false;
    let intentStatus = 'pending';
    const db = mockDb((sql, params) => {
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
      if (sql.includes('FROM provider_news_articles') && sql.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('FROM news_article_markets') && sql.includes('SELECT provider')) {
        return { rows: namInserted ? [{ provider: PROVIDER, provider_article_id: ARTICLE }] : [] };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        expect(params[0]).toBe(SOLANA_CHAIN);
        expect(params[1]).toBe(SOL_MINT);
        return { rows: [{ ...intentRow, status: intentStatus }] };
      }
      if (sql.includes('FROM launches') && sql.includes('SELECT 1')) {
        expect(params[1]).toBe(SOL_MINT);
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('INSERT INTO news_article_markets')) {
        expect(params[2]).toBe(SOLANA_CHAIN);
        expect(params[3]).toBe(SOL_MINT);
        namInserted = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE news_article_market_intents') && sql.includes("status = $2")) {
        intentStatus = 'done';
        return { rows: [{ ...intentRow, status: 'done' }] };
      }
      if (sql.includes('FROM news_article_markets nam')) {
        expect(params[0]).toBe(SOLANA_CHAIN);
        expect(params[1]).toBe(SOL_MINT);
        return {
          rows: [
            {
              provider: PROVIDER,
              provider_article_id: ARTICLE,
              title: HEADLINE,
              url: URL,
              canonical_url: URL,
              source_domain: SOURCE,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const ensured = await ensureNewsArticleMarketFromTrustedDraft(db, {
      chainId: SOLANA_CHAIN,
      tokenAddress: SOL_MINT,
      draftId: DRAFT,
    });
    expect(ensured.ok).toBe(true);
    if (ensured.ok && !ensured.skipped) {
      expect(ensured.linked).toBe(true);
      expect(ensured.intent.tokenAddress).toBe(SOL_MINT);
    }

    const lore = await getNewsArticleLoreForToken(db, {
      chainId: SOLANA_CHAIN,
      tokenAddress: SOL_MINT,
    });
    expect(lore).toEqual({
      provider: PROVIDER,
      providerArticleId: ARTICLE,
      title: HEADLINE,
      url: URL,
      canonicalUrl: URL,
      sourceDomain: SOURCE,
    });
  });
});
