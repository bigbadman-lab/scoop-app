/**
 * Local simulation: seed watchlist → ingest buy/sell/duplicate → assert state.
 * Uses mocked DB repos (no live RPC / production DB).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedPumpTradeEvent } from './provider/types.js';
import { MockPumpTradeProvider } from './provider/mock.js';

const upsertPumpTrade = vi.fn();
const applyPumpCandleTrade = vi.fn();
const refreshPumpMarketStateFromTrades = vi.fn();
const upsertPumpWorkerCheckpoint = vi.fn();
const listPumpWatchlist = vi.fn();

vi.mock('@scoop/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@scoop/db')>();
  return {
    ...actual,
    PUMP_CANDLE_INTERVALS: ['1m', '5m', '1h'],
    PUMP_MARKET_CHAIN_ID: 900001,
    upsertPumpTrade: (...args: unknown[]) => upsertPumpTrade(...args),
    applyPumpCandleTrade: (...args: unknown[]) => applyPumpCandleTrade(...args),
    refreshPumpMarketStateFromTrades: (...args: unknown[]) =>
      refreshPumpMarketStateFromTrades(...args),
    upsertPumpWorkerCheckpoint: (...args: unknown[]) => upsertPumpWorkerCheckpoint(...args),
    listPumpWatchlist: (...args: unknown[]) => listPumpWatchlist(...args),
    createPool: () => ({ end: async () => {}, query: async () => ({ rows: [] }) }),
    withTransaction: async (_pool: unknown, fn: (c: unknown) => Promise<unknown>) => fn({}),
    computePumpFdvSol: actual.computePumpFdvSol,
    pumpCandleBucketStart: actual.pumpCandleBucketStart,
  };
});

import { ingestNormalizedPumpTrade } from './ingest.js';
import { runPumpMarketDataWorker } from './run.js';
import { loadConfig } from './config.js';

const MINT = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function event(overrides: Partial<NormalizedPumpTradeEvent> = {}): NormalizedPumpTradeEvent {
  return {
    mint: MINT,
    signature: '5'.repeat(64),
    eventIndex: 0,
    slot: 100,
    blockTime: new Date('2026-09-21T12:00:00.000Z'),
    side: 'buy',
    wallet: 'So11111111111111111111111111111111111111112',
    tokenAmountRaw: '1000000',
    tokenAmount: '1',
    solAmountLamports: '100000000',
    solAmount: '0.1',
    priceSol: '0.1',
    source: 'pump',
    curveAddress: null,
    ...overrides,
  };
}

describe('local pump worker simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    applyPumpCandleTrade.mockResolvedValue(undefined);
    refreshPumpMarketStateFromTrades.mockResolvedValue({
      priceSol: '0.1',
      volume24hSol: '0.1',
      tradeCount24h: 1,
      buyCount24h: 1,
      sellCount24h: 0,
    });
    upsertPumpWorkerCheckpoint.mockResolvedValue({});
    listPumpWatchlist.mockResolvedValue([
      {
        chainId: 900001,
        mint: MINT,
        signature: '9'.repeat(64),
        creator: 'So11111111111111111111111111111111111111112',
        launchedAt: 1,
        name: 'Sim',
        symbol: 'SIM',
        imageUri: '',
        totalSupplyRaw: '1000000000000000',
        decimals: 6,
      },
    ]);
  });

  it('loads watchlist size 1 and ingests buy/sell with duplicate ignored', async () => {
    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      DATABASE_URL: 'postgres://localhost/sim',
      SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'mock',
    });
    const provider = new MockPumpTradeProvider();
    const { health, stop } = await runPumpMarketDataWorker(config, {
      provider,
      pool: { query: async () => ({ rows: [] }), end: async () => {} } as never,
      once: true,
    });

    expect(health.watchlistSize).toBe(1);
    expect(provider.getWatchedMints()).toEqual([MINT]);

    await provider.emit(event({ side: 'buy', signature: 'a'.repeat(64), eventIndex: 0 }));
    // allow async handler
    await new Promise((r) => setTimeout(r, 10));

    upsertPumpTrade.mockResolvedValueOnce({ inserted: true });
    await provider.emit(
      event({
        side: 'sell',
        signature: 'b'.repeat(64),
        eventIndex: 0,
        priceSol: '0.12',
        solAmount: '0.05',
      }),
    );
    await new Promise((r) => setTimeout(r, 10));

    upsertPumpTrade.mockResolvedValueOnce({ inserted: false });
    await provider.emit(event({ side: 'buy', signature: 'a'.repeat(64), eventIndex: 0 }));
    await new Promise((r) => setTimeout(r, 10));

    expect(health.eventsReceived).toBe(3);
    expect(health.eventsPersisted).toBe(2);
    expect(health.duplicatesSkipped).toBe(1);

    // Direct ingest asserts candle + state path for a fresh buy
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    const direct = await ingestNormalizedPumpTrade(
      {
        pool: {} as never,
        resolveWatchItem: () => listPumpWatchlist.mock.results[0]?.value?.[0],
      },
      event({ signature: 'c'.repeat(64), eventIndex: 1 }),
    );
    expect(direct).toEqual({ ok: true, inserted: true });
    expect(applyPumpCandleTrade).toHaveBeenCalled();
    expect(refreshPumpMarketStateFromTrades).toHaveBeenCalled();
    expect(upsertPumpWorkerCheckpoint).toHaveBeenCalled();

    await stop();
  });
});
