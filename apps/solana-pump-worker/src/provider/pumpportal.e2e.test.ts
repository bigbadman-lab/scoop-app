/**
 * Local end-to-end PumpPortal simulation with mocked socket + mocked DB ingest.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  };
});

import { loadConfig } from '../config.js';
import { runPumpMarketDataWorker } from '../run.js';
import {
  PumpPortalTradeProvider,
  type PumpPortalConnectSocket,
  type PumpPortalSocketHandlers,
} from './pumpportal.js';

const MINT_A = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MINT_B = 'So11111111111111111111111111111111111111112';
const MINT_C = 'MetaSzQ41RPMrG2v1vTY5jkFuSKtJ3ZiPXZVCtwytd9';

function watchItem(mint: string) {
  return {
    chainId: 900001 as const,
    mint,
    signature: '9'.repeat(64),
    creator: MINT_B,
    launchedAt: 1,
    name: 'T',
    symbol: 'T',
    imageUri: '',
    totalSupplyRaw: '1000000000000000',
    decimals: 6,
  };
}

function makeFakeSocket() {
  let handlers: PumpPortalSocketHandlers | null = null;
  const sent: string[] = [];
  let connectCount = 0;
  const connectSocket: PumpPortalConnectSocket = (_url, h) => {
    connectCount += 1;
    handlers = h;
    queueMicrotask(() => h.onOpen());
    return {
      send: (data: string) => sent.push(data),
      close: () => {
        const cur = handlers;
        handlers = null;
        cur?.onClose(1000, 'close');
      },
    };
  };
  return {
    connectSocket,
    sent,
    get connectCount() {
      return connectCount;
    },
    emit(msg: unknown) {
      handlers?.onMessage(JSON.stringify(msg));
    },
    forceClose() {
      const cur = handlers;
      handlers = null;
      cur?.onClose(1006, 'drop');
    },
  };
}

describe('pumpportal local e2e simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    applyPumpCandleTrade.mockResolvedValue(undefined);
    refreshPumpMarketStateFromTrades.mockResolvedValue({});
    upsertPumpWorkerCheckpoint.mockResolvedValue({});
    listPumpWatchlist.mockResolvedValue([watchItem(MINT_A), watchItem(MINT_B)]);
  });

  it('runs watchlist subscribe ingest unsubscribe reconnect flow', async () => {
    const fake = makeFakeSocket();
    const sleep = vi.fn(async () => {});
    const provider = new PumpPortalTradeProvider({
      apiKey: 'sim-key',
      connectSocket: fake.connectSocket,
      autoReconnect: true,
      sleep,
      reconnectBackoffMs: 1,
      maxReconnectBackoffMs: 1,
    });

    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'pumpportal',
      PUMPPORTAL_API_KEY: 'sim-key',
      DATABASE_URL: 'postgres://localhost/sim',
    });

    const { health, stop } = await runPumpMarketDataWorker(config, {
      provider,
      pool: { query: async () => ({ rows: [] }), end: async () => {} } as never,
      once: true,
      sleep,
    });

    expect(health.watchlistSize).toBe(2);
    expect(fake.connectCount).toBe(1);
    const initialSub = JSON.parse(fake.sent[0]!);
    expect(initialSub.method).toBe('subscribeTokenTrade');
    expect(initialSub.keys.sort()).toEqual([MINT_A, MINT_B].sort());

    // buy + sell + duplicate buy for A
    fake.emit({
      mint: MINT_A,
      signature: 'a'.repeat(64),
      txType: 'buy',
      tokenAmount: '10',
      solAmount: '0.1',
      traderPublicKey: MINT_B,
    });
    await new Promise((r) => setTimeout(r, 15));

    fake.emit({
      mint: MINT_A,
      signature: 'b'.repeat(64),
      txType: 'sell',
      tokenAmount: '5',
      solAmount: '0.05',
      traderPublicKey: MINT_B,
    });
    await new Promise((r) => setTimeout(r, 15));

    upsertPumpTrade.mockResolvedValueOnce({ inserted: false });
    fake.emit({
      mint: MINT_A,
      signature: 'a'.repeat(64),
      txType: 'buy',
      tokenAmount: '10',
      solAmount: '0.1',
      traderPublicKey: MINT_B,
    });
    await new Promise((r) => setTimeout(r, 15));

    // trade for B
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    fake.emit({
      mint: MINT_B,
      signature: 'c'.repeat(64),
      txType: 'buy',
      tokenAmount: '1',
      solAmount: '0.01',
      traderPublicKey: MINT_A,
    });
    await new Promise((r) => setTimeout(r, 15));

    expect(health.eventsReceived).toBe(4);
    expect(health.eventsPersisted).toBe(3);
    expect(health.duplicatesSkipped).toBe(1);

    // Add C / remove B via watchlist refresh path
    listPumpWatchlist.mockResolvedValue([watchItem(MINT_A), watchItem(MINT_C)]);
    fake.sent.length = 0;
    // manually drive subscribe/unsubscribe as refresh would
    await provider.subscribeMint(MINT_C);
    await provider.unsubscribeMint(MINT_B);
    expect(JSON.parse(fake.sent[0]!).method).toBe('subscribeTokenTrade');
    expect(JSON.parse(fake.sent[0]!).keys).toEqual([MINT_C]);
    expect(JSON.parse(fake.sent[1]!).method).toBe('unsubscribeTokenTrade');
    expect(JSON.parse(fake.sent[1]!).keys).toEqual([MINT_B]);
    expect(fake.connectCount).toBe(1);

    // Disconnect → reconnect resubscribes A+C only
    fake.forceClose();
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.connectCount).toBe(2);
    const resub = [...fake.sent].reverse().find((s) => s.includes('subscribeTokenTrade'));
    expect(JSON.parse(resub!).keys.sort()).toEqual([MINT_A, MINT_C].sort());
    expect(JSON.stringify(fake.sent)).not.toContain('subscribeNewToken');

    await stop();
  });
});
