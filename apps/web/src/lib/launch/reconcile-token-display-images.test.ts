import { describe, expect, it, vi } from 'vitest';
import { reconcileTokenDisplayImages } from '@/lib/launch/reconcile-token-display-images';
import { finalizeTokenDisplayImage } from '@/lib/launch/finalize-token-display-image';
import type { Queryable } from '@scoop/db';

const TOKEN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DRAFT = '11111111-1111-4111-8111-111111111111';
const IMAGE_URI = 'ipfs://bafybeiMUSEMODE000000000000000000000001';
const DISPLAY_PATH = `drafts/${DRAFT}/22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaa.png`;
const ORIGIN = 'https://proj.supabase.co';
const EXPECTED_URL = `${ORIGIN}/storage/v1/object/public/token-image/${DISPLAY_PATH}`;

/**
 * MUSE failure mode:
 * - receipt/indexing succeeded
 * - image_uri + draft display path exist
 * - browser never called POST /api/launch/display-image
 * - server reconciliation must still set display_image_url
 */
describe('reconcileTokenDisplayImages (MUSE failure mode)', () => {
  it('finalizes via pin-time intent without client ensureTokenDisplayImage', async () => {
    let displayUrl: string | null = null;
    const intent = {
      id: 'intent-1',
      chain_id: null as number | null,
      token_address: null as string | null,
      draft_id: DRAFT,
      display_image_path: DISPLAY_PATH,
      image_uri: IMAGE_URI,
      status: 'awaiting_token',
      attempts: 0,
      last_error: null as string | null,
    };

    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("status = 'expired'") || sql.includes("status = 'expired'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SET status = 'expired'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("status = 'awaiting_token'") && sql.includes('SELECT *')) {
        return { rows: [{ ...intent }] };
      }
      if (
        sql.includes('FROM tokens t') &&
        sql.includes('INNER JOIN launches') &&
        sql.includes('t.image_uri = $1')
      ) {
        return {
          rows: [{ chain_id: 4663, token_address: TOKEN }],
        };
      }
      if (sql.includes('AND id <> $3')) {
        return { rows: [] };
      }
      if (sql.includes('SET chain_id = $2') && sql.includes("status = 'pending'")) {
        intent.chain_id = 4663;
        intent.token_address = TOKEN;
        intent.status = 'pending';
        return { rows: [] };
      }
      if (sql.includes("status = 'pending'") && sql.includes('attempts <')) {
        return {
          rows: [
            {
              id: intent.id,
              chain_id: 4663,
              token_address: TOKEN,
              draft_id: DRAFT,
              display_image_path: DISPLAY_PATH,
              image_uri: IMAGE_URI,
              status: 'pending',
              attempts: 0,
              last_error: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: displayUrl, image_uri: IMAGE_URI }],
        };
      }
      if (
        sql.includes('FROM launches') ||
        (sql.includes('FROM tokens') && sql.includes('SELECT 1'))
      ) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      if (sql.includes('LEFT JOIN news_article_markets')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const db = { query } as unknown as Queryable;
    const logs: Record<string, unknown>[] = [];

    const summary = await reconcileTokenDisplayImages({
      db,
      finalize: (input) =>
        finalizeTokenDisplayImage({
          ...input,
          supabaseOrigin: ORIGIN,
          log: input.log,
        }),
      log: (fields) => logs.push(fields),
    });

    expect(summary.bound).toBe(1);
    expect(summary.intentsProcessed).toBe(1);
    expect(summary.intentsApplied).toBe(1);
    expect(displayUrl).toBe(EXPECTED_URL);
    expect(
      logs.some(
        (l) =>
          l.event === 'applied_path' && l.owner === 'server_reconciliation' && l.source === 'path',
      ),
    ).toBe(true);
    expect(logs.some((l) => l.event === 'reconcile_summary')).toBe(true);
  });

  it('orphan scan finalizes when no browser call and no intent (IPFS fallback)', async () => {
    let displayUrl: string | null = null;
    let mirrored = false;
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SET status = 'expired'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("status = 'awaiting_token'") && sql.includes('SELECT *')) {
        return { rows: [] };
      }
      if (sql.includes("status = 'pending'") && sql.includes('attempts <')) {
        return { rows: [] };
      }
      if (sql.includes('LEFT JOIN news_article_markets')) {
        return {
          rows: [
            {
              chain_id: 4663,
              token_address: TOKEN,
              image_uri: IMAGE_URI,
              draft_id: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT display_image_url, image_uri')) {
        return {
          rows: [{ display_image_url: displayUrl, image_uri: IMAGE_URI }],
        };
      }
      if (
        sql.includes('FROM launches') ||
        (sql.includes('FROM tokens') && sql.includes('SELECT 1'))
      ) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('SELECT display_image_url FROM tokens')) {
        return { rows: [{ display_image_url: displayUrl }] };
      }
      if (sql.includes('UPDATE tokens') && sql.includes('display_image_url')) {
        displayUrl = String(params[2]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const storage = {
      uploadDisplayCopy: vi.fn(async ({ path }: { path: string }) => {
        mirrored = true;
        return {
          path,
          publicUrl: `${ORIGIN}/storage/v1/object/public/token-image/${path}`,
        };
      }),
      publicUrlForPath: (p: string) => `${ORIGIN}/storage/v1/object/public/token-image/${p}`,
    };

    const summary = await reconcileTokenDisplayImages({
      db: { query } as unknown as Queryable,
      finalize: (input) =>
        finalizeTokenDisplayImage({
          ...input,
          tokenImageStorage: storage,
          fetchImpl: async (_url, init) => {
            if (init?.method === 'HEAD') {
              return new Response(null, { status: 404 });
            }
            return new Response(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
              {
                status: 200,
                headers: { 'content-type': 'image/png' },
              },
            );
          },
          supabaseOrigin: ORIGIN,
          log: () => undefined,
        }),
      log: () => undefined,
    });

    expect(summary.orphansProcessed).toBe(1);
    expect(summary.orphansApplied).toBe(1);
    expect(mirrored).toBe(true);
    expect(displayUrl).toMatch(/^https:\/\//);
  });

  it('uses an awaiting intent display path for an orphan token', async () => {
    const finalizeInputs: Array<{
      displayImagePath?: string | null;
      draftId?: string | null;
    }> = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SET status = 'expired'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("status = 'awaiting_token'") && sql.includes('SELECT *')) {
        return { rows: [] };
      }
      if (sql.includes("status = 'pending'") && sql.includes('attempts <')) {
        return { rows: [] };
      }
      if (sql.includes('LEFT JOIN news_article_markets')) {
        return {
          rows: [
            {
              chain_id: 4663,
              token_address: TOKEN,
              image_uri: IMAGE_URI,
              draft_id: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT display_image_path, draft_id')) {
        return {
          rows: [
            {
              display_image_path: DISPLAY_PATH,
              draft_id: DRAFT,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const summary = await reconcileTokenDisplayImages({
      db: { query } as unknown as Queryable,
      finalize: (async (input) => {
        finalizeInputs.push(input);
        return {
          ok: true,
          status: 'applied',
          source: 'path',
          uploaded: false,
          retries: 0,
          displayPath: DISPLAY_PATH,
        };
      }) as typeof finalizeTokenDisplayImage,
      log: () => undefined,
    });

    expect(summary.orphansApplied).toBe(1);
    expect(finalizeInputs).toHaveLength(1);
    expect(finalizeInputs[0]).toMatchObject({
      displayImagePath: DISPLAY_PATH,
      draftId: null,
    });
  });
});
