import { describe, expect, it, vi } from 'vitest';
import {
  PumpPortalTradeProvider,
  type PumpPortalConnectSocket,
  type PumpPortalSocketHandlers,
} from './pumpportal.js';

const MINT_A = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MINT_B = 'So11111111111111111111111111111111111111112';
const MINT_C = 'MetaSzQ41RPMrG2v1vTY5jkFuSKtJ3ZiPXZVCtwytd9';

function makeFakeSocket() {
  let handlers: PumpPortalSocketHandlers | null = null;
  const sent: string[] = [];
  let connectCount = 0;
  const urls: string[] = [];

  const connectSocket: PumpPortalConnectSocket = (url, h) => {
    connectCount += 1;
    urls.push(url);
    handlers = h;
    // Async open like a real socket.
    queueMicrotask(() => h.onOpen());
    return {
      send: (data: string) => {
        sent.push(data);
      },
      close: () => {
        const hClose = handlers;
        handlers = null;
        hClose?.onClose(1000, 'test-close');
      },
    };
  };

  return {
    connectSocket,
    sent,
    urls,
    get connectCount() {
      return connectCount;
    },
    emit(message: unknown) {
      handlers?.onMessage(JSON.stringify(message));
    },
    emitRaw(raw: string) {
      handlers?.onMessage(raw);
    },
    forceClose() {
      const h = handlers;
      handlers = null;
      h?.onClose(1006, 'abnormal');
    },
    get handlers() {
      return handlers;
    },
  };
}

function trade(overrides: Record<string, unknown> = {}) {
  return {
    mint: MINT_A,
    signature: '5'.repeat(64),
    txType: 'buy',
    tokenAmount: '1000',
    solAmount: '0.1',
    traderPublicKey: MINT_B,
    bondingCurveKey: '43qMNRPVo1oB8XYc9YZRuN9fKYSn782X5TnreNKWgS5b',
    ...overrides,
  };
}

describe('PumpPortalTradeProvider', () => {
  it('connects once and handles multiple mints on one socket', async () => {
    const fake = makeFakeSocket();
    const provider = new PumpPortalTradeProvider({
      apiKey: 'test-key-secret',
      connectSocket: fake.connectSocket,
      autoReconnect: false,
    });
    await provider.connect([MINT_A, MINT_B]);
    expect(fake.connectCount).toBe(1);
    expect(fake.sent).toHaveLength(1);
    const sub = JSON.parse(fake.sent[0]!);
    expect(sub.method).toBe('subscribeTokenTrade');
    expect(sub.keys).toEqual([MINT_A, MINT_B]);
    // API key is required in the WS URL for PumpPortal auth; must never appear in health/logs.
    expect(JSON.stringify(provider.health())).not.toContain('test-key-secret');
    await provider.close();
  });

  it('does not put API key into health JSON', async () => {
    const fake = makeFakeSocket();
    const provider = new PumpPortalTradeProvider({
      apiKey: 'super-secret-api-key',
      connectSocket: fake.connectSocket,
      autoReconnect: false,
    });
    await provider.connect([MINT_A]);
    expect(JSON.stringify(provider.health())).not.toMatch(/super-secret/);
    await provider.close();
  });

  it('subscribes new mint and unsubscribes removed without reconnect', async () => {
    const fake = makeFakeSocket();
    const provider = new PumpPortalTradeProvider({
      apiKey: 'k',
      connectSocket: fake.connectSocket,
      autoReconnect: false,
    });
    await provider.connect([MINT_A, MINT_B]);
    fake.sent.length = 0;

    await provider.subscribeMint(MINT_C);
    expect(JSON.parse(fake.sent[0]!).method).toBe('subscribeTokenTrade');
    expect(JSON.parse(fake.sent[0]!).keys).toEqual([MINT_C]);

    // Duplicate subscribe is a no-op
    fake.sent.length = 0;
    await provider.subscribeMint(MINT_C);
    expect(fake.sent).toHaveLength(0);

    await provider.unsubscribeMint(MINT_B);
    expect(JSON.parse(fake.sent[0]!).method).toBe('unsubscribeTokenTrade');
    expect(JSON.parse(fake.sent[0]!).keys).toEqual([MINT_B]);
    expect(provider.getSubscribedMints().sort()).toEqual([MINT_A, MINT_C].sort());
    expect(fake.connectCount).toBe(1);
    await provider.close();
  });

  it('normalizes buy/sell and drops unknown messages', async () => {
    const fake = makeFakeSocket();
    const provider = new PumpPortalTradeProvider({
      apiKey: 'k',
      connectSocket: fake.connectSocket,
      autoReconnect: false,
    });
    const events: string[] = [];
    provider.onTrade((e) => {
      events.push(`${e.side}:${e.signature}`);
    });
    await provider.connect([MINT_A]);
    fake.emit(trade({ txType: 'buy', signature: 'a'.repeat(64) }));
    fake.emit(trade({ txType: 'sell', signature: 'b'.repeat(64) }));
    fake.emit({ hello: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual([`buy:${'a'.repeat(64)}`, `sell:${'b'.repeat(64)}`]);
    expect(provider.health().normalizedEvents).toBe(2);
    await provider.close();
  });

  it('surfaces provider auth errors in health', async () => {
    const fake = makeFakeSocket();
    const provider = new PumpPortalTradeProvider({
      apiKey: 'k',
      connectSocket: fake.connectSocket,
      autoReconnect: false,
    });
    await provider.connect([MINT_A]);
    fake.emit({ error: 'Invalid API key' });
    await new Promise((r) => setTimeout(r, 5));
    expect(provider.health().status).toBe('blocked_auth');
    expect(provider.health().error).toMatch(/authentication/i);
    await provider.close();
  });

  it('reconnects and resubscribes current watchlist only', async () => {
    const fake = makeFakeSocket();
    const sleep = vi.fn(async () => {});
    const provider = new PumpPortalTradeProvider({
      apiKey: 'k',
      connectSocket: fake.connectSocket,
      autoReconnect: true,
      sleep,
      reconnectBackoffMs: 1,
      maxReconnectBackoffMs: 1,
    });
    await provider.connect([MINT_A, MINT_C]);
    await provider.unsubscribeMint(MINT_A);
    expect(provider.getWatchedMints()).toEqual([MINT_C]);

    fake.forceClose();
    await new Promise((r) => setTimeout(r, 20));
    expect(sleep).toHaveBeenCalled();
    expect(fake.connectCount).toBe(2);
    const lastSub = [...fake.sent].reverse().find((s) => s.includes('subscribeTokenTrade'));
    expect(lastSub).toBeTruthy();
    expect(JSON.parse(lastSub!).keys).toEqual([MINT_C]);
    expect(JSON.stringify(fake.sent)).not.toContain('subscribeNewToken');
    await provider.close();
  });
});
