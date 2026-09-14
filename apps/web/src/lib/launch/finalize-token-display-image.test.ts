import { describe, expect, it, vi } from 'vitest';
import { finalizeTokenDisplayImage } from '@/lib/launch/finalize-token-display-image';
import type { Queryable } from '@scoop/db';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORIGIN = 'https://proj.supabase.co';

function mockDb(handler: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('finalizeTokenDisplayImage', () => {
  it('no-ops when display_image_url already set', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [
            {
              display_image_url: `${ORIGIN}/storage/v1/object/public/token-image/manual/aa/aa.png`,
              image_uri: 'ipfs://bafy',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const storage = {
      uploadDisplayCopy: vi.fn(),
      publicUrlForPath: (p: string) => `${ORIGIN}/storage/v1/object/public/token-image/${p}`,
    };
    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafy',
      tokenImageStorage: storage,
      waitForIndex: false,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: true,
      status: 'skipped',
      source: 'existing',
      uploaded: false,
    });
    expect(storage.uploadDisplayCopy).not.toHaveBeenCalled();
  });

  it('reuses allowlisted path without reupload', async () => {
    let displayUrl: string | null = null;
    const db = mockDb((sql, params) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: displayUrl, image_uri: 'ipfs://bafy' }],
        };
      }
      if (sql.includes('FROM launches') || sql.includes('FROM tokens WHERE')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      return { rows: [] };
    });

    const path = 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png';
    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      displayImagePath: path,
      supabaseOrigin: ORIGIN,
      waitForIndex: false,
      log: () => undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('path');
      expect(result.uploaded).toBe(false);
      expect(result.displayPath).toBe(path);
    }
  });

  it('retries until token row exists then applies path', async () => {
    let attempts = 0;
    let displayUrl: string | null = null;
    const db = mockDb((sql, params) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        attempts += 1;
        if (attempts < 3) return { rows: [] };
        return {
          rows: [{ display_image_url: displayUrl, image_uri: null }],
        };
      }
      if (sql.includes('FROM launches') || (sql.includes('FROM tokens') && sql.includes('SELECT 1'))) {
        return { rows: [{ x: 1 }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      return { rows: [] };
    });

    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      supabaseOrigin: ORIGIN,
      waitForIndex: true,
      waitIntervalMs: 1,
      waitTimeoutMs: 5_000,
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.retries).toBeGreaterThanOrEqual(2);
      expect(result.source).toBe('path');
    }
  });

  it('times out when token never indexes', async () => {
    const db = mockDb(() => ({ rows: [] }));
    let t = 0;
    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeiabc',
      waitForIndex: true,
      waitIntervalMs: 10,
      waitTimeoutMs: 25,
      now: () => {
        t += 10;
        return t;
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      error: 'launch_not_indexed',
      retryable: true,
    });
  });

  it('mirrors IPFS when draft display is missing', async () => {
    let displayUrl: string | null = null;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const db = mockDb((sql, params) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [
            {
              display_image_url: displayUrl,
              image_uri: 'ipfs://bafybeitestdisplaycid0000000000000001',
            },
          ],
        };
      }
      if (sql.includes('FROM launches') || (sql.includes('FROM tokens') && sql.includes('SELECT 1'))) {
        return { rows: [{ x: 1 }] };
      }
      if (sql.includes('launch_draft_artworks')) {
        return { rows: [{ display_image_url: null }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      return { rows: [] };
    });

    const storage = {
      uploadDisplayCopy: vi.fn(async ({ path }: { path: string }) => ({
        path,
        publicUrl: `${ORIGIN}/storage/v1/object/public/token-image/${path}`,
      })),
      publicUrlForPath: (path: string) =>
        `${ORIGIN}/storage/v1/object/public/token-image/${path}`,
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      if (u.includes('ipfs.io')) {
        return new Response(png, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      draftId: 'draft-1',
      imageUri: 'ipfs://bafybeitestdisplaycid0000000000000001',
      tokenImageStorage: storage,
      fetchImpl,
      waitForIndex: false,
      log: () => undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('ipfs_fallback');
      expect(result.uploaded).toBe(true);
      expect(result.displayPath).toContain('canonical/');
    }
    expect(storage.uploadDisplayCopy).toHaveBeenCalledTimes(1);

    // Duplicate invocation should reuse existing object (HEAD ok) and skip upload.
    const result2 = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeitestdisplaycid0000000000000001',
      tokenImageStorage: storage,
      fetchImpl: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return new Response(null, { status: 200 });
        }
        return new Response(png, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }) as unknown as typeof fetch,
      waitForIndex: false,
      log: () => undefined,
    });
    // First call set display URL — second is existing skip.
    expect(result2).toMatchObject({ ok: true, source: 'existing' });
    expect(storage.uploadDisplayCopy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image IPFS responses', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: null, image_uri: 'ipfs://bafybeiabc' }],
        };
      }
      return { rows: [] };
    });
    const storage = {
      uploadDisplayCopy: vi.fn(),
      publicUrlForPath: (p: string) => `${ORIGIN}/x/${p}`,
    };
    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeiabc',
      tokenImageStorage: storage,
      fetchImpl: vi.fn(async () =>
        new Response('not-an-image', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ) as unknown as typeof fetch,
      waitForIndex: false,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      error: 'non_image_content',
      retryable: false,
    });
    expect(storage.uploadDisplayCopy).not.toHaveBeenCalled();
  });

  it('returns clear error when DB write fails', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: null, image_uri: null }],
        };
      }
      if (sql.includes('FROM launches') || (sql.includes('FROM tokens') && sql.includes('SELECT 1'))) {
        return { rows: [{ x: 1 }] };
      }
      if (sql.includes('UPDATE tokens')) {
        throw new Error('db_down');
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: null }] };
      }
      return { rows: [] };
    });
    const result = await finalizeTokenDisplayImage({
      db,
      chainId: 4663,
      tokenAddress: TOKEN,
      displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      supabaseOrigin: ORIGIN,
      waitForIndex: false,
      log: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      error: 'db_down',
      retryable: true,
    });
  });
});
