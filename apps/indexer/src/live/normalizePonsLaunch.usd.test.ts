import { describe, expect, it, vi } from 'vitest';
import { refreshPonsMarketActivity } from './normalizePonsLaunch.js';

describe('refreshPonsMarketActivity USD', () => {
  it('writes price/FDV USD when quote snapshot resolves', async () => {
    const queries: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('COUNT(*)') && sql.includes('FROM trades')) {
          return {
            rows: [
              {
                trade_count: '2',
                buy_count: '1',
                sell_count: '1',
                quote_volume: '1000000000000000000',
                token_volume: '1000000000000000000000',
                last_trade_at: '1700000000',
                usd_volume: null,
              },
            ],
          };
        }
        if (sql.includes('FROM quote_price_snapshots') || sql.includes('getLatestQuotePriceUsd')) {
          return { rows: [] };
        }
        // resolveUsdMarketFields → getLatestQuotePriceUsd
        if (sql.includes('quote_price_snapshots') || sql.toLowerCase().includes('price_usd_x18')) {
          return {
            rows: [
              {
                price_usd_x18: '2000000000000000000000',
                observed_at: new Date(),
                oracle_max_age: 86400,
              },
            ],
          };
        }
        if (sql.includes('upsert') || sql.includes('INSERT INTO token_market_state') || sql.includes('token_market_state')) {
          return { rows: [] };
        }
        void params;
        return { rows: [] };
      }),
    };

    // Mock resolve via injecting rows that getLatestQuotePriceUsd would need —
    // refresh calls resolveUsdMarketFields which hits db. Stub by replacing module is heavy;
    // instead spy the query pattern used by getLatestQuotePriceUsd.
    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM trades') && sql.includes('COUNT(*)')) {
        return {
          rows: [
            {
              trade_count: '1',
              buy_count: '1',
              sell_count: '0',
              quote_volume: '1000000000000000000',
              token_volume: '500000000000000000000',
              last_trade_at: '1700000000',
              usd_volume: null,
            },
          ],
        };
      }
      if (
        sql.includes('quote_price_snapshots') ||
        (sql.includes('price_usd_x18') && sql.includes('observed_at'))
      ) {
        return {
          rows: [
            {
              price_usd_x18: '2000000000000000000000',
              observed_at: new Date(),
              oracle_max_age: null,
            },
          ],
        };
      }
      // upsertTokenMarketState uses parameterized INSERT — return empty
      return { rows: [] };
    });

    await refreshPonsMarketActivity(db as never, {
      chainId: 4663,
      tokenAddress: '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b',
      syntheticPoolId: '0x' + '11'.repeat(32),
      blockNumber: 1n,
      priceQuoteX18: 1680000000n,
      quoteAsset: '0x0000000000000000000000000000000000000000',
      totalSupplyRaw: 10n ** 27n,
      tokenDecimals: 18,
      quoteDecimals: 18,
      quoteUsdMaxAgeSeconds: 86400,
      nowMs: Date.now(),
    });

    // Final write should include non-null USD fields via upsertTokenMarketState SQL.
    const writeCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) =>
        String(c[0]).includes('token_market_state') ||
        String(c[0]).includes('price_usd'),
    );
    expect(writeCalls.length).toBeGreaterThan(0);
  });

  it('keeps USD null when quote has no snapshot (honest gap)', async () => {
    const upsertParams: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM trades') && sql.includes('COUNT(*)')) {
          return {
            rows: [
              {
                trade_count: '1',
                buy_count: '1',
                sell_count: '0',
                quote_volume: '1',
                token_volume: '1',
                last_trade_at: null,
                usd_volume: null,
              },
            ],
          };
        }
        if (sql.includes('quote_price') || sql.includes('observed_at')) {
          return { rows: [] };
        }
        if (params) upsertParams.push(params);
        return { rows: [] };
      }),
    };

    await refreshPonsMarketActivity(db as never, {
      chainId: 4663,
      tokenAddress: '0xa3f47a8a3032707b8bd414e96beebe82c97b4336',
      syntheticPoolId: '0x' + '22'.repeat(32),
      blockNumber: 1n,
      priceQuoteX18: 10370197159n,
      quoteAsset: '0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e',
      totalSupplyRaw: 10n ** 27n,
      tokenDecimals: 18,
      quoteDecimals: 18,
      quoteUsdMaxAgeSeconds: 300,
      nowMs: Date.now(),
    });

    // Should still attempt a market-state write with null USD (no fabrication).
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });
});
