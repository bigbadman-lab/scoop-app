import { describe, expect, it, vi } from 'vitest';
import { bindAndFinalizeTokenDisplayImage } from '@/lib/launch/bind-token-display-image';
import type { Queryable } from '@scoop/db';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORIGIN = 'https://proj.supabase.co';
const IPFS = 'ipfs://bafkreiclg5m2graeqq2u3ghkztzhcirx53yrrol24q73fps5garpb7s7o4';
const MANUAL_PATH = 'manual/4b3759a344048435/4b3759a344048435.png';
const DRAFT_PATH =
  'drafts/4797830a-156e-46e8-a45e-32938900767d/a7111a7a-8c97-4441-a9c6-ec8b290f7190/97e16e0b2b16ac33.png';

function mockDb(handler: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('bindAndFinalizeTokenDisplayImage', () => {
  it('manual: binds before token row and returns public URL', async () => {
    const intent = {
      id: 'intent-1',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'pending',
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes('awaiting_token')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return { rows: [] }; // token row absent
      }
      return { rows: [] };
    });

    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      displayImagePath: MANUAL_PATH,
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      bound: true,
      finalized: false,
      tokenRowPresent: false,
      source: 'path',
      displayImageUrl: `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`,
    });
  });

  it('manual: binds and finalizes when token row already exists', async () => {
    let displayUrl: string | null = null;
    const intent = {
      id: 'intent-2',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'pending',
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql, params) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes('awaiting_token')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: displayUrl, image_uri: IPFS }],
        };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('SET status = $2') || sql.includes("status = $2")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      bound: true,
      finalized: true,
      tokenRowPresent: true,
      displayImageUrl: `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`,
    });
    expect(displayUrl).toBe(
      `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`,
    );
  });

  it('generated draft path: binds and returns public URL', async () => {
    const intent = {
      id: 'intent-draft',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: '4797830a-156e-46e8-a45e-32938900767d',
      display_image_path: DRAFT_PATH,
      image_uri: IPFS,
      status: 'pending',
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes('awaiting_token')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      draftId: '4797830a-156e-46e8-a45e-32938900767d',
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      bound: true,
      finalized: false,
      source: 'draft',
      displayImageUrl: `${ORIGIN}/storage/v1/object/public/token-image/${DRAFT_PATH}`,
    });
  });

  it('idempotent: second bind returns existing display URL', async () => {
    const existing = `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`;
    const intent = {
      id: 'intent-3',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'done',
      attempts: 1,
      last_error: null,
    };
    const db = mockDb((sql) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes("'awaiting_token'")) {
        return { rows: [] };
      }
      if (
        sql.includes('SELECT * FROM token_display_finalize_intents') &&
        sql.includes('token_address = $2')
      ) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: existing, image_uri: IPFS }],
        };
      }
      return { rows: [] };
    });

    const first = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });
    const second = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(first).toMatchObject({
      ok: true,
      finalized: true,
      source: 'existing',
      displayImageUrl: existing,
    });
    expect(second).toMatchObject({
      ok: true,
      finalized: true,
      source: 'existing',
      displayImageUrl: existing,
    });
  });

  it('T110 regression: awaiting_token + null display becomes bound with URL', async () => {
    const awaiting = {
      id: '9e459fc8-0000-0000-0000-000000000001',
      chain_id: null,
      token_address: null,
      draft_id: null,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'awaiting_token',
      attempts: 0,
      last_error: null,
    };
    const bound = {
      ...awaiting,
      chain_id: 4663,
      token_address: TOKEN,
      status: 'pending',
    };
    const db = mockDb((sql) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes('awaiting_token')) {
        return { rows: [bound] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return { rows: [{ display_image_url: null, image_uri: IPFS }] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: null }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      bound: true,
      finalized: true,
      displayImageUrl: `${ORIGIN}/storage/v1/object/public/token-image/${MANUAL_PATH}`,
    });
  });

  it('KEY regression: returns draftId from bound intent when client omits it', async () => {
    const DRAFT = '5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08';
    const intent = {
      id: 'intent-key',
      chain_id: 4663,
      token_address: TOKEN,
      draft_id: DRAFT,
      display_image_path: MANUAL_PATH,
      image_uri: IPFS,
      status: 'pending',
      attempts: 0,
      last_error: null,
    };
    const db = mockDb((sql) => {
      if (sql.includes('UPDATE token_display_finalize_intents') && sql.includes('awaiting_token')) {
        return { rows: [intent] };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return { rows: [{ display_image_url: null, image_uri: IPFS }] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: null }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      // Client omitted draftId (provenance gap) — server must still surface it.
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      draftId: DRAFT,
      intentId: 'intent-key',
    });
  });

  it('security: rejects non-ipfs imageUri', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'https://evil.example/x.png',
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_IMAGE_URI',
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('security: rejects disallowed client path', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: IPFS,
      displayImagePath: '../etc/passwd',
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_PATH',
    });
  });

  it('security: intent missing for imageUri does not mutate', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await bindAndFinalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeiunknown',
      supabaseOrigin: ORIGIN,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'INTENT_NOT_FOUND',
    });
    const writes = db.query.mock.calls.filter(
      ([sql]) =>
        typeof sql === 'string' &&
        (sql.includes('UPDATE tokens') || sql.includes('INSERT INTO token_display_finalize_intents')),
    );
    expect(writes).toHaveLength(0);
  });
});
