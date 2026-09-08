import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import { priceUsdX18FromQuote, fdvUsdX18FromPrice } from '@scoop/shared';
import { revalueMarketsForQuote } from './revalueQuoteMarkets.js';

const ETH = ZERO_ADDRESS;
const HELLO = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
const OTHER = '0x1111111111111111111111111111111111111111';
const AAPL_TOKEN = '0x2222222222222222222222222222222222222222';
const AAPL = '0xaf3d0000000000000000000000000000000093f9';

describe('revalueMarketsForQuote', () => {
  it('HELLO-style ETH market gets USD price/FDV without a swap', async () => {
    const priceQuote = 2031177705n;
    const quoteUsd = 3000n * 10n ** 18n;
    const supply = 1_000_000_000n * 10n ** 18n;
    const updates: Array<Record<string, unknown>> = [];

    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM token_market_state')) {
          expect(params?.[1]).toBe(ETH);
          return {
            rows: [
              {
                token_address: HELLO,
                price_quote_x18: priceQuote.toString(),
                total_supply_raw: supply.toString(),
                decimals: 18,
                last_trade_at: '1700000000',
                volume_24h_usd_x18: null,
                volume_24h_quote_raw: '0',
              },
            ],
          };
        }
        if (sql.includes('UPDATE token_market_state')) {
          updates.push({
            token: params?.[1],
            quoteUsd: params?.[2],
            priceUsd: params?.[3],
            fdvUsd: params?.[4],
          });
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const result = await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: ETH,
      quoteUsdX18: quoteUsd,
      log: () => undefined,
    });

    expect(result.updated).toBe(1);
    expect(result.results[0]?.ok).toBe(true);
    const expectedPrice = priceUsdX18FromQuote({
      priceQuoteX18: priceQuote,
      quoteUsdX18: quoteUsd,
    });
    const expectedFdv = fdvUsdX18FromPrice({
      priceUsdX18: expectedPrice,
      totalSupplyRaw: supply,
      tokenDecimals: 18,
    });
    expect(result.results[0]?.priceUsdX18).toBe(expectedPrice);
    expect(result.results[0]?.fdvUsdX18).toBe(expectedFdv);
    expect(updates[0]?.priceUsd).toBe(expectedPrice.toString());
    expect(updates[0]?.fdvUsd).toBe(expectedFdv.toString());
  });

  it('updates multiple markets on same quote; skips other quotes via list filter', async () => {
    const quoteUsd = 2000n * 10n ** 18n;
    const updatedTokens: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM token_market_state')) {
          expect(params?.[1]).toBe(ETH);
          return {
            rows: [
              {
                token_address: HELLO,
                price_quote_x18: '1000000000000000000',
                total_supply_raw: '1000000000000000000000',
                decimals: 18,
                last_trade_at: '1',
                volume_24h_usd_x18: null,
                volume_24h_quote_raw: '5',
              },
              {
                token_address: OTHER,
                price_quote_x18: '2000000000000000000',
                total_supply_raw: '1000000000000000000000',
                decimals: 18,
                last_trade_at: '2',
                volume_24h_usd_x18: '9',
                volume_24h_quote_raw: '7',
              },
            ],
          };
        }
        if (sql.includes('UPDATE token_market_state')) {
          updatedTokens.push(String(params?.[1]));
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const result = await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: ETH,
      quoteUsdX18: quoteUsd,
      log: () => undefined,
    });
    expect(result.updated).toBe(2);
    expect(updatedTokens).toEqual([HELLO, OTHER]);
  });

  it('idempotent: same quote price twice yields same USD fields', async () => {
    const quoteUsd = 2500n * 10n ** 18n;
    const prices: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM token_market_state')) {
          return {
            rows: [
              {
                token_address: HELLO,
                price_quote_x18: '1000000000000000000',
                total_supply_raw: '1000000000000000000000',
                decimals: 18,
                last_trade_at: null,
                volume_24h_usd_x18: null,
                volume_24h_quote_raw: '0',
              },
            ],
          };
        }
        if (sql.includes('UPDATE token_market_state')) {
          prices.push(String(params?.[3]));
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: ETH,
      quoteUsdX18: quoteUsd,
      log: () => undefined,
    });
    await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: ETH,
      quoteUsdX18: quoteUsd,
      log: () => undefined,
    });
    expect(prices).toHaveLength(2);
    expect(prices[0]).toBe(prices[1]);
  });

  it('one market failure does not block others', async () => {
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM token_market_state')) {
          return {
            rows: [
              {
                token_address: HELLO,
                price_quote_x18: 'not-a-number',
                total_supply_raw: '1',
                decimals: 18,
                last_trade_at: null,
                volume_24h_usd_x18: null,
                volume_24h_quote_raw: '0',
              },
              {
                token_address: OTHER,
                price_quote_x18: '1000000000000000000',
                total_supply_raw: '1000000000000000000000',
                decimals: 18,
                last_trade_at: null,
                volume_24h_usd_x18: null,
                volume_24h_quote_raw: '0',
              },
            ],
          };
        }
        if (sql.includes('UPDATE token_market_state')) {
          if (String(params?.[1]) === HELLO) throw new Error('should not reach');
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const result = await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: ETH,
      quoteUsdX18: 10n ** 18n,
      log: () => undefined,
    });
    expect(result.failed).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.results.find((r) => r.tokenAddress === OTHER)?.ok).toBe(true);
  });

  it('does not invent when quoteUsd non-positive', async () => {
    const db = { query: vi.fn() };
    const result = await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: AAPL,
      quoteUsdX18: 0n,
      log: () => undefined,
    });
    expect(result.updated).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('UPDATE only touches USD columns (SQL contract)', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM token_market_state')) {
          return {
            rows: [
              {
                token_address: AAPL_TOKEN,
                price_quote_x18: '1000000000000000000',
                total_supply_raw: '1000000000000000000000',
                decimals: 18,
                last_trade_at: '42',
                volume_24h_usd_x18: '99',
                volume_24h_quote_raw: '88',
              },
            ],
          };
        }
        if (sql.includes('UPDATE token_market_state')) {
          expect(sql).toContain('quote_usd_x18');
          expect(sql).toContain('price_usd_x18');
          expect(sql).toContain('fdv_usd_x18');
          expect(sql).toContain('updated_at');
          expect(sql).not.toContain('last_trade_at');
          expect(sql).not.toContain('volume_24h');
          expect(sql).not.toContain('price_quote_x18');
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await revalueMarketsForQuote(db as never, {
      chainId: 4663,
      quoteAsset: AAPL,
      quoteUsdX18: 150n * 10n ** 18n,
      log: () => undefined,
    });
    expect(db.query).toHaveBeenCalled();
  });
});
