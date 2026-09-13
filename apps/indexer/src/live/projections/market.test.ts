import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';

const upsertMock = vi.fn(async () => undefined);
vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    upsertTokenMarketState: (...args: unknown[]) => upsertMock(...args),
  };
});

vi.mock('./usd.js', () => ({
  resolveUsdMarketFields: vi.fn(async () => ({
    quoteUsdX18: null,
    priceUsdX18: null,
    fdvUsdX18: null,
  })),
}));

import {
  MARKET_VOLUME_24H_WINDOW_SECONDS,
  refreshTokenMarketFromTrades,
} from './market.js';

const TOKEN = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
const POOL = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TX = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = 1_700_000_000;

function baseRefreshArgs(nowSec: number) {
  return {
    chainId: 4663,
    tokenAddress: TOKEN,
    poolId: POOL,
    tickLower: -200_000,
    tickUpper: 200_000,
    openingSqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
    liquidityRaw: 1_000_000n,
    sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
    tick: 0,
    sourceBlock: 100n,
    sourceTxHash: TX,
    sourceLogIndex: 1,
    quoteAsset: ZERO_ADDRESS,
    tokenIsCurrency1: true,
    nowSec,
  };
}

type TradeRow = {
  quote_amount_raw: string;
  token_amount_raw: string;
  side: 'buy' | 'sell';
  block_timestamp: number;
  block_number: string;
  usd_value_x18: string | null;
  execution_price_quote_x18: string;
};

function makeDb(trades: TradeRow[]) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM launches') && sql.includes('JOIN tokens')) {
        return {
          rows: [
            {
              quote_asset: ZERO_ADDRESS,
              token_decimals: 18,
              total_supply_raw: (1_000_000_000n * 10n ** 18n).toString(),
              quote_decimals: 18,
            },
          ],
        };
      }
      if (sql.includes('FROM trades') && sql.includes('block_timestamp >=')) {
        const windowStart = Number(params?.[2]);
        const inWindow = trades.filter((t) => t.block_timestamp >= windowStart);
        const quoteVolume = inWindow.reduce(
          (acc, t) => acc + BigInt(t.quote_amount_raw),
          0n,
        );
        const allUsd = inWindow.every((t) => t.usd_value_x18 != null);
        const usdVolume =
          inWindow.length === 0
            ? '0'
            : allUsd
              ? inWindow
                  .reduce((acc, t) => acc + BigInt(t.usd_value_x18!), 0n)
                  .toString()
              : null;
        return {
          rows: [
            {
              trade_count: String(inWindow.length),
              buy_count: String(inWindow.filter((t) => t.side === 'buy').length),
              sell_count: String(inWindow.filter((t) => t.side === 'sell').length),
              quote_volume: quoteVolume.toString(),
              usd_volume: usdVolume,
              usd_valued_count: String(
                inWindow.filter((t) => t.usd_value_x18 != null).length,
              ),
              first_price: inWindow[0]?.execution_price_quote_x18 ?? null,
              last_price:
                inWindow[inWindow.length - 1]?.execution_price_quote_x18 ?? null,
            },
          ],
        };
      }
      if (sql.includes('FROM trades') && !sql.includes('block_timestamp >=')) {
        const quoteVolume = trades.reduce(
          (acc, t) => acc + BigInt(t.quote_amount_raw),
          0n,
        );
        const tokenVolume = trades.reduce(
          (acc, t) => acc + BigInt(t.token_amount_raw),
          0n,
        );
        const last = trades[trades.length - 1];
        return {
          rows: [
            {
              trade_count: String(trades.length),
              buy_count: String(trades.filter((t) => t.side === 'buy').length),
              sell_count: String(trades.filter((t) => t.side === 'sell').length),
              quote_volume: quoteVolume.toString(),
              token_volume: tokenVolume.toString(),
              last_trade_at: last ? String(last.block_timestamp) : null,
              last_trade_block: last ? last.block_number : null,
            },
          ],
        };
      }
      if (sql.includes('FROM holder_balances')) {
        return { rows: [{ all_count: '0', retail_count: '0' }] };
      }
      if (sql.includes('FROM token_market_state')) {
        return { rows: [{ initial_token_inventory_raw: null }] };
      }
      return { rows: [] };
    }),
  };
}

describe('refreshTokenMarketFromTrades 24h window', () => {
  it('uses a 86400-second rolling window boundary (>= windowStart)', async () => {
    expect(MARKET_VOLUME_24H_WINDOW_SECONDS).toBe(86_400);
  });

  it('market with no trades → volume24h = 0', async () => {
    upsertMock.mockClear();
    const db = makeDb([]);
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '0',
        volume24hUsdX18: '0',
        tradeCount24h: 0,
        priceChange24hBps: null,
        tradeCountAllTime: 0,
      }),
    );
  });

  it('only trades older than 24h → volume24h = 0', async () => {
    upsertMock.mockClear();
    const db = makeDb([
      {
        quote_amount_raw: '1000',
        token_amount_raw: '5000',
        side: 'buy',
        block_timestamp: NOW - MARKET_VOLUME_24H_WINDOW_SECONDS - 1,
        block_number: '10',
        usd_value_x18: '1000',
        execution_price_quote_x18: '100',
      },
    ]);
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '0',
        tradeCount24h: 0,
        tradeCountAllTime: 1,
        quoteVolumeAllTimeRaw: '1000',
        priceChange24hBps: null,
      }),
    );
  });

  it('trade ~23h59m old still contributes', async () => {
    upsertMock.mockClear();
    const db = makeDb([
      {
        quote_amount_raw: '2500',
        token_amount_raw: '9000',
        side: 'buy',
        block_timestamp: NOW - (MARKET_VOLUME_24H_WINDOW_SECONDS - 60),
        block_number: '11',
        usd_value_x18: '2500',
        execution_price_quote_x18: '100',
      },
    ]);
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '2500',
        tradeCount24h: 1,
        volume24hUsdX18: '2500',
      }),
    );
  });

  it('includes trade exactly at cutoff (block_timestamp >= windowStart)', async () => {
    upsertMock.mockClear();
    const db = makeDb([
      {
        quote_amount_raw: '777',
        token_amount_raw: '1',
        side: 'buy',
        block_timestamp: NOW - MARKET_VOLUME_24H_WINDOW_SECONDS,
        block_number: '12',
        usd_value_x18: '777',
        execution_price_quote_x18: '50',
      },
    ]);
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '777',
        tradeCount24h: 1,
      }),
    );
  });

  it('mixed recent + historical includes only recent volume', async () => {
    upsertMock.mockClear();
    const db = makeDb([
      {
        quote_amount_raw: '100',
        token_amount_raw: '1',
        side: 'buy',
        block_timestamp: NOW - MARKET_VOLUME_24H_WINDOW_SECONDS - 10,
        block_number: '1',
        usd_value_x18: '100',
        execution_price_quote_x18: '10',
      },
      {
        quote_amount_raw: '40',
        token_amount_raw: '2',
        side: 'sell',
        block_timestamp: NOW - 100,
        block_number: '2',
        usd_value_x18: '40',
        execution_price_quote_x18: '20',
      },
      {
        quote_amount_raw: '60',
        token_amount_raw: '3',
        side: 'buy',
        block_timestamp: NOW - 50,
        block_number: '3',
        usd_value_x18: '60',
        execution_price_quote_x18: '30',
      },
    ]);
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '100',
        tradeCount24h: 2,
        buyCount24h: 1,
        sellCount24h: 1,
        tradeCountAllTime: 3,
        quoteVolumeAllTimeRaw: '200',
      }),
    );
  });

  it('historical launch/dev-buy ages out with advanced nowSec (no new trade)', async () => {
    upsertMock.mockClear();
    const launchTs = NOW - 3 * 86_400;
    const trades: TradeRow[] = [
      {
        quote_amount_raw: '500000000000000000',
        token_amount_raw: '1000000000000000000000',
        side: 'buy',
        block_timestamp: launchTs,
        block_number: '55863290',
        usd_value_x18: '1500000000000000000000',
        execution_price_quote_x18: '500000000000000',
      },
    ];
    const db = makeDb(trades);

    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(launchTs + 60));
    expect(upsertMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '500000000000000000',
        tradeCount24h: 1,
      }),
    );

    upsertMock.mockClear();
    await refreshTokenMarketFromTrades(db as never, baseRefreshArgs(NOW));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        volume24hQuoteRaw: '0',
        tradeCount24h: 0,
        tradeCountAllTime: 1,
        quoteVolumeAllTimeRaw: '500000000000000000',
        priceChange24hBps: null,
      }),
    );
  });
});
