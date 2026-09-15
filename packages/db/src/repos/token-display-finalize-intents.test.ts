import { describe, expect, it, vi } from 'vitest';
import { applyBoundDisplayImageOnTokenInsert } from './token-display-finalize-intents.js';
import type { Queryable } from '../types.js';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORIGIN = 'https://proj.supabase.co';
const IPFS = 'ipfs://bafkreiclg5m2graeqq2u3ghkztzhcirx53yrrol24q73fps5garpb7s7o4';
const MANUAL_PATH = 'manual/4b3759a344048435/4b3759a344048435.png';

function mockDb(handler: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('applyBoundDisplayImageOnTokenInsert', () => {
  it('applies display URL from awaiting intent when token is indexed', async () => {
    let displayUrl: string | null = null;
    const intent = {
      id: 'intent-1',
      chain_id: null,
      token_address: null,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'awaiting_token' as const,
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql, params) => {
      if (sql.includes('FROM token_display_finalize_intents')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('UPDATE token_display_finalize_intents')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await applyBoundDisplayImageOnTokenInsert(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseUrl: ORIGIN,
    });

    expect(result).toMatchObject({
      applied: true,
      intentFound: true,
      pathFound: true,
      displayImageUrl: `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`,
    });
    expect(displayUrl).toBe(result.displayImageUrl);
  });

  it('is idempotent when display URL already set', async () => {
    const existing = `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`;
    const intent = {
      id: 'intent-2',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql) => {
      if (sql.includes('FROM token_display_finalize_intents')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: existing }] };
      }
      if (sql.includes('UPDATE token_display_finalize_intents')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await applyBoundDisplayImageOnTokenInsert(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseUrl: ORIGIN,
    });

    expect(result).toMatchObject({
      applied: false,
      skipped: true,
      displayImageUrl: existing,
    });
  });

  it('no-ops without matching intent', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await applyBoundDisplayImageOnTokenInsert(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseUrl: ORIGIN,
    });
    expect(result).toMatchObject({
      applied: false,
      intentFound: false,
      displayImageUrl: null,
    });
  });

  it('C1/C6 ZHANG-class: news draft_id on display finalize creates news intent/link', async () => {
    const DRAFT = '592a24ee-8763-4612-9560-56370995b39e';
    const PROVIDER = 'stocknewsapi';
    const ARTICLE = 'sna_url_389e568f77f48bd92009759a';
    let displayUrl: string | null = null;
    let newsIntentInserted = false;
    let namInserted = false;
    const intent = {
      id: 'intent-zhang',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: DRAFT,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'awaiting_token' as const,
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql, params) => {
      if (sql.includes('FROM token_display_finalize_intents')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('UPDATE token_display_finalize_intents')) {
        return { rows: [] };
      }
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
        return namInserted
          ? { rows: [{ provider: PROVIDER, provider_article_id: ARTICLE }] }
          : { rows: [] };
      }
      if (sql.includes('FROM launches')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        newsIntentInserted = true;
        return {
          rows: [
            {
              id: 'nami-1',
              chain_id: 4663,
              token_address: TOKEN,
              provider: PROVIDER,
              provider_article_id: ARTICLE,
              draft_id: DRAFT,
              status: 'pending',
              attempts: 0,
              last_error: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO news_article_markets')) {
        namInserted = true;
        return { rows: [] };
      }
      if (sql.includes('UPDATE news_article_market_intents')) {
        return {
          rows: [
            {
              id: 'nami-1',
              chain_id: 4663,
              token_address: TOKEN,
              provider: PROVIDER,
              provider_article_id: ARTICLE,
              draft_id: DRAFT,
              status: 'done',
              attempts: 0,
              last_error: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await applyBoundDisplayImageOnTokenInsert(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseUrl: ORIGIN,
    });

    expect(result.applied).toBe(true);
    expect(newsIntentInserted).toBe(true);
    expect(namInserted).toBe(true);
  });

  it('C2: non-news draft_id does not create news relationship', async () => {
    let newsIntentInserted = false;
    const intent = {
      id: 'intent-manual',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'pending' as const,
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql, params) => {
      if (sql.includes('FROM token_display_finalize_intents')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: null }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE token_display_finalize_intents')) {
        return { rows: [] };
      }
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
      if (sql.includes('INSERT INTO news_article_market_intents')) {
        newsIntentInserted = true;
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await applyBoundDisplayImageOnTokenInsert(db, {
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseUrl: ORIGIN,
    });
    expect(result.applied).toBe(true);
    expect(newsIntentInserted).toBe(false);
  });
});
