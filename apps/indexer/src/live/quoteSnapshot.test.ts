import { describe, expect, it, vi } from 'vitest';
import { maybeSnapshotQuoteUsd } from './quoteSnapshot.js';
import { ZERO_ADDRESS } from '@scoop/shared';

const ETH = ZERO_ADDRESS;
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const AAPL = '0xaf3d0000000000000000000000000000000093f9';

describe('maybeSnapshotQuoteUsd multi-asset loop', () => {
  it('snapshots each eligible quote; one failure does not stop others', async () => {
    const inserted: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM quote_assets')) {
          return {
            rows: [
              {
                quote_asset: ETH,
                symbol: 'ETH',
                decimals: 18,
                oracle_feed: '0x1111111111111111111111111111111111111111',
                oracle_max_age: 86400,
              },
              {
                quote_asset: USDG,
                symbol: 'USDG',
                decimals: 6,
                oracle_feed: '0x2222222222222222222222222222222222222222',
                oracle_max_age: 86400,
              },
              {
                quote_asset: AAPL,
                symbol: 'AAPL',
                decimals: 18,
                oracle_feed: '0x3333333333333333333333333333333333333333',
                oracle_max_age: 345600,
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO quote_price_snapshots')) {
          inserted.push(String(params?.[1]));
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const client = {
      readContract: vi.fn(async ({ args }: { args: [string] }) => {
        const asset = args[0]!.toLowerCase();
        if (asset === USDG) throw new Error('oracle down for USDG');
        if (asset === ETH) return 3000n * 10n ** 18n;
        return 150n * 10n ** 18n;
      }),
    };

    const result = await maybeSnapshotQuoteUsd({
      db: db as never,
      client: client as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSnapshotAtMs: 0,
      nowMs: 60_000,
    });

    expect(result.snapped).toBe(true);
    expect(result.results.filter((r) => r.ok)).toHaveLength(2);
    expect(result.results.find((r) => r.symbol === 'USDG')?.ok).toBe(false);
    expect(inserted).toContain(ETH);
    expect(inserted).toContain(AAPL);
    expect(inserted).not.toContain(USDG);
  });

  it('does not invent snapshots when no eligible assets', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM quote_assets')) return { rows: [] };
        return { rows: [] };
      }),
    };
    const client = { readContract: vi.fn() };
    const result = await maybeSnapshotQuoteUsd({
      db: db as never,
      client: client as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSnapshotAtMs: 0,
      nowMs: 60_000,
    });
    expect(result.snapped).toBe(false);
    expect(client.readContract).not.toHaveBeenCalled();
  });
});
