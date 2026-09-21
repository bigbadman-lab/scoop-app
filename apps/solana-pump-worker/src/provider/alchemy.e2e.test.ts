/**
 * Local end-to-end Alchemy simulation with mocked socket + mocked DB ingest.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertPumpTrade = vi.fn();
const applyPumpCandleTrade = vi.fn();
const refreshPumpMarketStateFromTrades = vi.fn();
const upsertPumpWorkerCheckpoint = vi.fn();
const listPumpWatchlist = vi.fn();
const getPumpWorkerCheckpoint = vi.fn();

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
    getPumpWorkerCheckpoint: (...args: unknown[]) => getPumpWorkerCheckpoint(...args),
    listPumpWatchlist: (...args: unknown[]) => listPumpWatchlist(...args),
    createPool: () => ({ end: async () => {}, query: async () => ({ rows: [] }) }),
    withTransaction: async (_pool: unknown, fn: (c: unknown) => Promise<unknown>) => fn({}),
  };
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { runPumpMarketDataWorker } from '../run.js';
import {
  AlchemyTradeProvider,
  type AlchemyConnectSocket,
  type AlchemySocketHandlers,
} from './alchemy.js';
import type { JsonParsedTransaction } from './alchemy-rpc.js';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const SIG_A =
  '3XdV6QPWh1Mgews451rB7KxvyHPJzrRevYbDG5CwyQP2h3SyC6DW8Uh71PdKk2S58k22RG8LTTwSQRMnindHhyaf';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function watchItem(mint: string) {
  return {
    chainId: 900001 as const,
    mint,
    signature: '9'.repeat(64),
    creator: 'So11111111111111111111111111111111111111112',
    launchedAt: 1,
    name: 'SCPY',
    symbol: 'SCPY',
    imageUri: '',
    totalSupplyRaw: '1000000000000000',
    decimals: 6,
  };
}

function makeFakeSocket() {
  let handlers: AlchemySocketHandlers | null = null;
  const sent: string[] = [];
  let connectCount = 0;
  const connectSocket: AlchemyConnectSocket = (_url, h) => {
    connectCount += 1;
    handlers = h;
    queueMicrotask(() => h.onOpen());
    return {
      send: (data: string) => {
        sent.push(data);
        const req = JSON.parse(data) as { id?: number; method?: string; params?: unknown[] };
        if (req.method === 'logsSubscribe' && typeof req.id === 'number') {
          queueMicrotask(() => {
            handlers?.onMessage(
              JSON.stringify({ jsonrpc: '2.0', id: req.id, result: 42 + connectCount }),
            );
          });
        }
      },
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
  };
}

describe('alchemy local e2e simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    applyPumpCandleTrade.mockResolvedValue(undefined);
    refreshPumpMarketStateFromTrades.mockResolvedValue({});
    upsertPumpWorkerCheckpoint.mockResolvedValue({});
    getPumpWorkerCheckpoint.mockResolvedValue(null);
    listPumpWatchlist.mockResolvedValue([watchItem(MINT)]);
  });

  it('subscribes mint-specific logs and persists decoded trade', async () => {
    const fake = makeFakeSocket();
    const sleep = vi.fn(async () => {});
    const tx = JSON.parse(
      readFileSync(join(FIXTURES, 'scpy-buy-a.json'), 'utf8'),
    ) as JsonParsedTransaction;

    const rpc = vi.fn(async (method: string) => {
      if (method === 'getSignaturesForAddress') return [];
      if (method === 'getTransaction') return tx;
      throw new Error(`unexpected rpc ${method}`);
    });

    const provider = new AlchemyTradeProvider({
      rpcUrl: 'https://solana-mainnet.g.alchemy.com/v2/test',
      connectSocket: fake.connectSocket,
      rpc: rpc as never,
      autoReconnect: false,
      autoReconcile: false,
      sleep,
    });

    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'alchemy',
      SOLANA_RPC_URL: 'https://solana-mainnet.g.alchemy.com/v2/test',
      DATABASE_URL: 'postgres://localhost/sim',
    });

    const { health, stop } = await runPumpMarketDataWorker(config, {
      provider,
      pool: { query: async () => ({ rows: [] }), end: async () => {} } as never,
      once: true,
      sleep,
    });

    expect(health.watchlistSize).toBe(1);
    expect(fake.connectCount).toBe(1);
    await vi.waitFor(() => {
      expect(fake.sent.some((s) => s.includes('logsSubscribe'))).toBe(true);
    });
    const sub = JSON.parse(fake.sent.find((s) => s.includes('logsSubscribe'))!);
    expect(sub.method).toBe('logsSubscribe');
    expect(sub.params[0]).toEqual({ mentions: [MINT] });
    expect(sub.params[1]).toEqual({ commitment: 'confirmed' });

    fake.emit({
      jsonrpc: '2.0',
      method: 'logsNotification',
      params: {
        subscription: 43,
        result: {
          value: { signature: SIG_A, err: null, logs: ['Program log: Instruction: Buy'] },
        },
      },
    });

    // subscription id from first connect ack is 42+1=43
    await vi.waitFor(() => {
      expect(upsertPumpTrade).toHaveBeenCalled();
    });

    const tradeArg = upsertPumpTrade.mock.calls[0]![1] as { source: string; side: string; mint: string };
    expect(tradeArg.source).toBe('alchemy');
    expect(tradeArg.side).toBe('buy');
    expect(tradeArg.mint).toBe(MINT);

    // Duplicate notification must not double-insert via provider soft-dedupe
    fake.emit({
      jsonrpc: '2.0',
      method: 'logsNotification',
      params: {
        subscription: 43,
        result: { value: { signature: SIG_A, err: null, logs: [] } },
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(upsertPumpTrade).toHaveBeenCalledTimes(1);

    await stop();
  });
});
