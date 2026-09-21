/**
 * PumpPortal Real-time Data API provider.
 *
 * Endpoint: wss://pumpportal.fun/api/data?api-key=<PUMPPORTAL_API_KEY>
 * One WebSocket; dynamic subscribeTokenTrade / unsubscribeTokenTrade by mint.
 * Never opens one socket per mint. Never subscribes to global new-token feed.
 */

import WebSocket from 'ws';
import { logJson } from '../log.js';
import {
  classifyPumpPortalProviderError,
  normalizePumpPortalTrade,
} from './normalize-pumpportal.js';
import type {
  PumpTradeHandler,
  PumpTradeProvider,
  PumpTradeProviderHealth,
  PumpProviderStatus,
} from './types.js';

export const PUMPPORTAL_WS_BASE = 'wss://pumpportal.fun/api/data';

export type PumpPortalSocketHandlers = {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onError: (err: Error) => void;
  onClose: (code?: number, reason?: string) => void;
};

export type PumpPortalSocketHandle = {
  send: (data: string) => void;
  close: () => void;
};

export type PumpPortalConnectSocket = (
  url: string,
  handlers: PumpPortalSocketHandlers,
) => PumpPortalSocketHandle;

export type PumpPortalProviderOptions = {
  apiKey: string;
  reconnectBackoffMs?: number;
  maxReconnectBackoffMs?: number;
  /** Injectable clock / sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  connectSocket?: PumpPortalConnectSocket;
  /** Disable auto-reconnect (tests). */
  autoReconnect?: boolean;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Node runtime uses the `ws` package — globalThis.WebSocket is not available on Render Node 20. */
function defaultConnectSocket(
  url: string,
  handlers: PumpPortalSocketHandlers,
): PumpPortalSocketHandle {
  const ws = new WebSocket(url);
  ws.on('open', () => handlers.onOpen());
  ws.on('message', (data) => {
    const text =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Array.isArray(data)
            ? Buffer.concat(data).toString('utf8')
            : Buffer.from(data as ArrayBuffer).toString('utf8');
    handlers.onMessage(text);
  });
  ws.on('error', (err) => {
    handlers.onError(
      err instanceof Error ? err : new Error('PumpPortal WebSocket error'),
    );
  });
  ws.on('close', (code, reason) => {
    handlers.onClose(code, reason?.toString());
  });
  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
  };
}

function redactUrl(url: string): string {
  return url.replace(/api-key=[^&]+/i, 'api-key=REDACTED');
}

function withJitter(ms: number): number {
  const jitter = Math.floor(ms * 0.2 * Math.random());
  return ms + jitter;
}

export class PumpPortalTradeProvider implements PumpTradeProvider {
  private readonly apiKey: string;
  private readonly reconnectBackoffMs: number;
  private readonly maxReconnectBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly connectSocket: PumpPortalConnectSocket;
  private readonly autoReconnect: boolean;

  private handlers: PumpTradeHandler[] = [];
  private watched = new Set<string>();
  private subscribed = new Set<string>();
  private socket: PumpPortalSocketHandle | null = null;
  private status: PumpProviderStatus = 'disconnected';
  private error: string | null = null;
  private closed = false;
  private intentionalClose = false;
  private reconnectCount = 0;
  private messagesReceived = 0;
  private normalizedEvents = 0;
  private invalidEvents = 0;
  private lastMessageAt: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: Promise<void> | null = null;

  constructor(opts: PumpPortalProviderOptions) {
    if (!opts.apiKey.trim()) {
      throw new Error('PUMPPORTAL_API_KEY is required for pumpportal provider');
    }
    this.apiKey = opts.apiKey.trim();
    this.reconnectBackoffMs = opts.reconnectBackoffMs ?? 2_000;
    this.maxReconnectBackoffMs = opts.maxReconnectBackoffMs ?? 60_000;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.connectSocket = opts.connectSocket ?? defaultConnectSocket;
    this.autoReconnect = opts.autoReconnect ?? true;
  }

  onTrade(handler: PumpTradeHandler): void {
    this.handlers.push(handler);
  }

  health(): PumpTradeProviderHealth {
    return {
      status: this.status,
      error: this.error,
      provider: 'pumpportal',
      subscribedMintCount: this.subscribed.size,
      messagesReceived: this.messagesReceived,
      normalizedEvents: this.normalizedEvents,
      invalidEvents: this.invalidEvents,
      reconnectCount: this.reconnectCount,
      lastMessageAt: this.lastMessageAt,
    };
  }

  async connect(watchedMints: readonly string[]): Promise<void> {
    if (this.closed) throw new Error('PumpPortalTradeProvider is closed');
    this.watched = new Set(watchedMints);
    this.intentionalClose = false;
    await this.openSocketAndSubscribe();
  }

  async subscribeMint(mint: string): Promise<void> {
    if (this.closed) throw new Error('PumpPortalTradeProvider is closed');
    if (this.watched.has(mint) && this.subscribed.has(mint)) return;
    this.watched.add(mint);
    if (this.status === 'connected' || this.status === 'subscribed') {
      this.sendSubscribe([mint]);
    }
  }

  async unsubscribeMint(mint: string): Promise<void> {
    this.watched.delete(mint);
    if (this.subscribed.has(mint) && this.socket) {
      this.sendUnsubscribe([mint]);
      this.subscribed.delete(mint);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.intentionalClose = true;
    this.socket?.close();
    this.socket = null;
    this.status = 'disconnected';
    this.subscribed.clear();
    this.handlers = [];
  }

  /** Test helper — current watched set. */
  getWatchedMints(): string[] {
    return [...this.watched];
  }

  getSubscribedMints(): string[] {
    return [...this.subscribed];
  }

  private wsUrl(): string {
    return `${PUMPPORTAL_WS_BASE}?api-key=${encodeURIComponent(this.apiKey)}`;
  }

  private async openSocketAndSubscribe(): Promise<void> {
    if (this.closed) return;
    this.status = this.reconnectCount > 0 ? 'reconnecting' : 'connecting';
    this.error = null;

    const url = this.wsUrl();
    logJson('info', 'pumpportal connecting', {
      url: redactUrl(url),
      watchlistSize: this.watched.size,
      reconnectCount: this.reconnectCount,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      try {
        this.socket = this.connectSocket(url, {
          onOpen: () => {
            this.status = 'connected';
            this.reconnectAttempt = 0;
            this.error = null;
            this.resubscribeAll();
            if (this.subscribed.size > 0) {
              this.status = 'subscribed';
            }
            logJson('info', 'pumpportal connected', {
              subscribedMintCount: this.subscribed.size,
            });
            if (!settled) {
              settled = true;
              resolve();
            }
          },
          onMessage: (data) => {
            void this.handleMessage(data);
          },
          onError: (err) => {
            this.error = err.message;
            const classified = classifyPumpPortalProviderError(err.message);
            if (classified.status === 'ok') {
              this.error = null;
              return;
            }
            this.status = classified.status;
            this.error = classified.error;
            logJson('error', 'pumpportal socket error', {
              error: classified.error,
              status: classified.status,
            });
            if (!settled) {
              settled = true;
              reject(err);
            }
          },
          onClose: (code, reason) => {
            this.socket = null;
            this.subscribed.clear();
            if (this.intentionalClose || this.closed) {
              this.status = 'disconnected';
              return;
            }
            logJson('warn', 'pumpportal disconnected', {
              code: code ?? null,
              reason: reason ? reason.slice(0, 120) : null,
            });
            void this.scheduleReconnect();
          },
        });
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  }

  private resubscribeAll(): void {
    this.subscribed.clear();
    const mints = [...this.watched];
    if (mints.length === 0) return;
    this.sendSubscribe(mints);
  }

  private sendSubscribe(mints: string[]): void {
    if (!this.socket || mints.length === 0) return;
    const fresh = mints.filter((m) => !this.subscribed.has(m));
    if (fresh.length === 0) return;
    this.socket.send(
      JSON.stringify({
        method: 'subscribeTokenTrade',
        keys: fresh,
      }),
    );
    for (const m of fresh) this.subscribed.add(m);
    this.status = 'subscribed';
    logJson('info', 'pumpportal subscribeTokenTrade', {
      mintCount: fresh.length,
      // Never log full watchlist at debug spam — count only in hot path is fine;
      // include mints for small diffs during tests/ops (base58 public ids).
      mints: fresh,
    });
  }

  private sendUnsubscribe(mints: string[]): void {
    if (!this.socket || mints.length === 0) return;
    this.socket.send(
      JSON.stringify({
        method: 'unsubscribeTokenTrade',
        keys: mints,
      }),
    );
    logJson('info', 'pumpportal unsubscribeTokenTrade', {
      mintCount: mints.length,
      mints,
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    this.messagesReceived += 1;
    this.lastMessageAt = this.now().toISOString();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.invalidEvents += 1;
      return;
    }

    // Provider may send error/status objects.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const errText =
        typeof obj.error === 'string'
          ? obj.error
          : typeof obj.message === 'string' && obj.txType == null
            ? obj.message
            : null;
      if (errText && obj.txType == null && obj.signature == null) {
        const classified = classifyPumpPortalProviderError(errText);
        if (classified.status === 'ok') {
          logJson('info', 'pumpportal provider ack', {
            message: errText.slice(0, 120),
            subscribedMintCount: this.subscribed.size,
          });
          this.status = this.subscribed.size > 0 ? 'subscribed' : 'connected';
          this.error = null;
          return;
        }
        this.status = classified.status;
        this.error = classified.error;
        logJson('error', 'pumpportal provider message', {
          status: classified.status,
          error: classified.error,
        });
        return;
      }
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const result = normalizePumpPortalTrade(item, { receivedAt: this.now() });
      if (!result.ok) {
        // Quietly ignore non-trade control messages; count hard invalids.
        if (
          result.error.startsWith('ignored') ||
          result.error === 'missing txType' ||
          result.error === 'not an object'
        ) {
          continue;
        }
        this.invalidEvents += 1;
        continue;
      }
      if (!this.watched.has(result.event.mint)) {
        // Not in SCOOP watchlist — drop (defense in depth).
        continue;
      }
      this.normalizedEvents += 1;
      for (const handler of this.handlers) {
        await handler(result.event);
      }
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (!this.autoReconnect || this.closed || this.intentionalClose) {
      this.status = 'disconnected';
      return;
    }
    if (this.reconnectTimer) return;

    this.status = 'reconnecting';
    this.reconnectCount += 1;
    this.reconnectAttempt += 1;
    const exp = Math.min(
      this.maxReconnectBackoffMs,
      this.reconnectBackoffMs * 2 ** Math.min(this.reconnectAttempt - 1, 8),
    );
    const delay = withJitter(exp);
    logJson('info', 'pumpportal reconnect scheduled', {
      delayMs: delay,
      reconnectCount: this.reconnectCount,
    });

    this.reconnectTimer = (async () => {
      try {
        await this.sleep(delay);
        if (this.closed || this.intentionalClose) return;
        await this.openSocketAndSubscribe();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.error = message;
        this.status = 'degraded';
        logJson('error', 'pumpportal reconnect failed', { error: message });
        this.reconnectTimer = null;
        void this.scheduleReconnect();
        return;
      } finally {
        this.reconnectTimer = null;
      }
    })();
  }
}
