import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { PUMP_PROGRAM_ID } from '@scoop/shared';

vi.mock('@/lib/launch/ensure-pump-token-display-image', () => ({
  ensurePumpTokenDisplayImage: vi.fn(async () => ({
    ok: true,
    displayImageUrl: 'https://example.supabase.co/storage/v1/object/public/token-image/manual/abc/abc.jpg',
    status: 'applied',
  })),
}));

const upsertPumpMarket = vi.fn();
const registerExternalPumpImport = vi.fn();
const getExternalPumpImport = vi.fn();
const getPumpWatchlistItem = vi.fn();
const collectExternalPumpCanaryFootprint = vi.fn();

vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    upsertPumpMarket: (...args: unknown[]) => upsertPumpMarket(...args),
    registerExternalPumpImport: (...args: unknown[]) => registerExternalPumpImport(...args),
    getExternalPumpImport: (...args: unknown[]) => getExternalPumpImport(...args),
    getPumpWatchlistItem: (...args: unknown[]) => getPumpWatchlistItem(...args),
    collectExternalPumpCanaryFootprint: (...args: unknown[]) =>
      collectExternalPumpCanaryFootprint(...args),
  };
});

import {
  importExternalPumpMarket,
  preflightExternalPumpMint,
} from '@/lib/launch/import-external-pump-market';

const MINT = '3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump';
const CREATOR = '4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu';
const SIG = '4vM2CmpHzns9Ly6kZSzdP6NiEBrJo3uegLBfmh3nMHELUr7mzy6wxfm8zi8RzEuocXRdCURQChmxfxJhEMyh5DpQ';

function bondingCurve(): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(MINT).toBuffer()],
    new PublicKey(PUMP_PROGRAM_ID),
  );
  return pda.toBase58();
}

describe('external Pump import helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExternalPumpImport.mockResolvedValue(null);
    getPumpWatchlistItem.mockResolvedValue({ mint: MINT });
    upsertPumpMarket.mockResolvedValue({
      chainId: 900001,
      mint: MINT,
      signature: SIG,
      marketSource: 'pump',
      created: true,
    });
    registerExternalPumpImport.mockResolvedValue(undefined);
  });

  it('rejects invalid mint shapes', async () => {
    await expect(
      preflightExternalPumpMint({ rpcUrl: 'https://example.invalid', mint: '0xabc' }),
    ).rejects.toThrow(/Invalid Solana mint/i);
  });

  it('blocks hijacking an existing non-registry SCOOP market', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM launches')) {
          return { rows: [{ launch_tx_hash: 'other', market_source: 'pump' }] };
        }
        return { rows: [] };
      }),
    };
    // Mock preflight by stubbing fetch RPC would be heavy — call import with
    // a patched preflight path via module mock of fetch responses instead.
    const originalFetch = globalThis.fetch;
    const curve = bondingCurve();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('example.invalid') || init?.method === 'POST') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.method === 'getAccountInfo' && body.params?.[0] === MINT) {
          return new Response(
            JSON.stringify({
              result: {
                value: {
                  data: {
                    parsed: {
                      info: {
                        decimals: 6,
                        supply: '1000',
                        extensions: [
                          {
                            extension: 'tokenMetadata',
                            state: {
                              name: 'I identify as rich',
                              symbol: 'Transfinance',
                              uri: 'https://meta.example/m.json',
                            },
                          },
                        ],
                      },
                    },
                    program: 'spl-token-2022',
                  },
                  owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (body.method === 'getAccountInfo' && body.params?.[0] === curve) {
          return new Response(
            JSON.stringify({
              result: { value: { owner: PUMP_PROGRAM_ID, data: ['', 'base64'] } },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (body.method === 'getSignaturesForAddress') {
          return new Response(
            JSON.stringify({
              result: [{ signature: SIG, slot: 1, blockTime: 100, err: null }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (body.method === 'getTransaction') {
          return new Response(
            JSON.stringify({
              result: {
                slot: 1,
                blockTime: 100,
                meta: { err: null },
                transaction: {
                  message: { accountKeys: [CREATOR, PUMP_PROGRAM_ID, MINT, curve] },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }
      if (url.includes('meta.example')) {
        return new Response(
          JSON.stringify({
            name: 'I identify as rich',
            symbol: 'Transfinance',
            image: 'https://img.example/a.jpg',
            description: 'Created on rapidlaunch',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      await expect(
        importExternalPumpMarket({
          db: db as never,
          rpcUrl: 'https://rpc.example.invalid',
          mint: MINT,
          blockExistingNonRegistry: true,
        }),
      ).rejects.toThrow(/without an external-import registry marker/i);
      expect(upsertPumpMarket).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('imports a verified Pump mint and registers canary marker', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM launches')) return { rows: [] };
        if (sql.includes('display_image_url')) {
          return { rows: [{ display_image_url: null }] };
        }
        return { rows: [] };
      }),
    };
    const curve = bondingCurve();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (init?.method === 'POST' && body.method === 'getAccountInfo' && body.params?.[0] === MINT) {
        return new Response(
          JSON.stringify({
            result: {
              value: {
                data: {
                  parsed: {
                    info: {
                      decimals: 6,
                      supply: '969304847921729',
                      extensions: [
                        {
                          extension: 'tokenMetadata',
                          state: {
                            name: 'I identify as rich',
                            symbol: 'Transfinance',
                            uri: 'https://meta.example/m.json',
                          },
                        },
                      ],
                    },
                  },
                  program: 'spl-token-2022',
                },
                owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (init?.method === 'POST' && body.method === 'getAccountInfo' && body.params?.[0] === curve) {
        return new Response(
          JSON.stringify({
            result: { value: { owner: PUMP_PROGRAM_ID, data: ['', 'base64'] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (init?.method === 'POST' && body.method === 'getSignaturesForAddress') {
        return new Response(
          JSON.stringify({
            result: [{ signature: SIG, slot: 449382562, blockTime: 1790081074, err: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (init?.method === 'POST' && body.method === 'getTransaction') {
        return new Response(
          JSON.stringify({
            result: {
              slot: 449382562,
              blockTime: 1790081074,
              meta: { err: null },
              transaction: {
                message: { accountKeys: [CREATOR, PUMP_PROGRAM_ID, MINT, curve] },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('meta.example')) {
        return new Response(
          JSON.stringify({
            name: 'I identify as rich',
            symbol: 'Transfinance',
            image: 'https://img.example/a.jpg',
            description: 'Created on rapidlaunch',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const result = await importExternalPumpMarket({
        db: db as never,
        rpcUrl: 'https://rpc.example.invalid',
        mint: MINT,
        importKind: 'canary',
      });
      expect(result.preflight.mint).toBe(MINT);
      expect(result.preflight.pumpProvenance).toBe('verified');
      expect(result.preflight.creator).toBe(CREATOR);
      expect(result.persist.marketSource).toBe('pump');
      expect(result.registryKind).toBe('canary');
      expect(upsertPumpMarket).toHaveBeenCalledTimes(1);
      expect(registerExternalPumpImport).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ mint: MINT, importKind: 'canary', launchSignature: SIG }),
      );
      expect(result.displayImage.ok).toBe(true);
      expect(result.watchlistPresent).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
