import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import { resolveTradeUsdFields, resolveUsdMarketFields } from './usd.js';

function mockDb(handlers: {
  getLatest?: () => Promise<{
    rows: Array<{
      price_usd_x18: string;
      observed_at: Date;
      decimals: number | null;
      oracle_max_age: number | null;
    }>;
  }>;
}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('quote_price_snapshots')) {
        return handlers.getLatest ? handlers.getLatest() : { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe('resolveUsdMarketFields', () => {
  const base = {
    chainId: 4663,
    quoteAsset: ZERO_ADDRESS,
    priceQuoteX18: 2n * 10n ** 18n,
    totalSupplyRaw: 1000n * 10n ** 18n,
    tokenDecimals: 18,
    maxAgeSeconds: 300,
  };

  it('ETH quote + fresh oracle → USD price and FDV', async () => {
    const now = Date.now();
    const db = mockDb({
      getLatest: async () => ({
        rows: [
          {
            price_usd_x18: (3000n * 10n ** 18n).toString(),
            observed_at: new Date(now - 30_000),
            decimals: 18,
            oracle_max_age: 86400,
          },
        ],
      }),
    });

    const result = await resolveUsdMarketFields(db as never, { ...base, nowMs: now });
    expect(result.reason).toBe('ok');
    expect(result.quoteUsdX18).toBe(3000n * 10n ** 18n);
    expect(result.priceUsdX18).toBe(6000n * 10n ** 18n);
    expect(result.fdvUsdX18).toBe(6_000_000n * 10n ** 18n);
  });

  it('unsupported quote (no snapshot) → null USD/FDV', async () => {
    const db = mockDb({ getLatest: async () => ({ rows: [] }) });
    const result = await resolveUsdMarketFields(db as never, {
      ...base,
      quoteAsset: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', // USDG
    });
    expect(result.reason).toBe('no_snapshot');
    expect(result.priceUsdX18).toBeNull();
    expect(result.fdvUsdX18).toBeNull();
  });

  it('stale quote snapshot → null USD/FDV', async () => {
    const now = Date.now();
    const db = mockDb({
      getLatest: async () => ({
        rows: [
          {
            price_usd_x18: (3000n * 10n ** 18n).toString(),
            observed_at: new Date(now - 600_000), // 10 min
            decimals: 18,
            oracle_max_age: 86400,
          },
        ],
      }),
    });
    const result = await resolveUsdMarketFields(db as never, {
      ...base,
      maxAgeSeconds: 300,
      nowMs: now,
    });
    expect(result.reason).toBe('stale');
    expect(result.priceUsdX18).toBeNull();
    expect(result.fdvUsdX18).toBeNull();
  });

  it('does not invent market cap — FDV only from total supply', async () => {
    const now = Date.now();
    const db = mockDb({
      getLatest: async () => ({
        rows: [
          {
            price_usd_x18: (1n * 10n ** 18n).toString(),
            observed_at: new Date(now),
            decimals: 18,
            oracle_max_age: 86400,
          },
        ],
      }),
    });
    const result = await resolveUsdMarketFields(db as never, {
      ...base,
      priceQuoteX18: 1n * 10n ** 18n,
      totalSupplyRaw: 50n * 10n ** 18n,
      nowMs: now,
    });
    expect(result.fdvUsdX18).toBe(50n * 10n ** 18n);
  });
});

describe('resolveTradeUsdFields', () => {
  it('uses at-or-before snapshot for trade notional', async () => {
    const tradeSec = 1_700_000_100;
    const db = mockDb({
      getLatest: async () => ({
        rows: [
          {
            price_usd_x18: (2000n * 10n ** 18n).toString(),
            observed_at: new Date(tradeSec * 1000 - 60_000),
            decimals: 18,
            oracle_max_age: 86400,
          },
        ],
      }),
    });
    const result = await resolveTradeUsdFields(db as never, {
      chainId: 4663,
      quoteAsset: ZERO_ADDRESS,
      quoteAmountRaw: 10n ** 18n,
      executionPriceQuoteX18: 1n * 10n ** 18n,
      quoteDecimals: 18,
      tradeTimestampSec: tradeSec,
      maxAgeSeconds: 300,
    });
    expect(result.reason).toBe('ok');
    expect(result.usdValueX18).toBe(2000n * 10n ** 18n);
    expect(result.executionPriceUsdX18).toBe(2000n * 10n ** 18n);
  });

  it('stale relative to trade time → null notional', async () => {
    const tradeSec = 1_700_000_100;
    const db = mockDb({
      getLatest: async () => ({
        rows: [
          {
            price_usd_x18: (2000n * 10n ** 18n).toString(),
            observed_at: new Date(tradeSec * 1000 - 600_000),
            decimals: 18,
            oracle_max_age: 86400,
          },
        ],
      }),
    });
    const result = await resolveTradeUsdFields(db as never, {
      chainId: 4663,
      quoteAsset: ZERO_ADDRESS,
      quoteAmountRaw: 10n ** 18n,
      executionPriceQuoteX18: 1n * 10n ** 18n,
      quoteDecimals: 18,
      tradeTimestampSec: tradeSec,
      maxAgeSeconds: 300,
    });
    expect(result.reason).toBe('stale');
    expect(result.usdValueX18).toBeNull();
  });
});
