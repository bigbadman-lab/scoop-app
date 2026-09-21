/**
 * Alchemy Solana market-data provider.
 *
 * - HTTPS JSON-RPC via SOLANA_RPC_URL
 * - WSS derived from the same URL (logsSubscribe mentions=[mint])
 * - Bounded getSignaturesForAddress reconciliation per SCOOP mint
 *
 * No PumpPortal. No global "all" logs subscription. No wallet keys.
 */

import WebSocket from 'ws';
import { logJson } from '../log.js';
import {
  classifyRpcProvider,
  createSolanaRpc,
  getSignaturesForAddress,
  getTransaction,
  httpRpcToWsUrl,
  type SignatureInfo,
  type SolanaRpcCall,
} from './alchemy-rpc.js';
import { decodeAlchemyPumpTrades } from './decode-alchemy-trade.js';
import type {
  PumpTradeHandler,
  PumpTradeProvider,
  PumpTradeProviderHealth,
  PumpProviderStatus,
} from './types.js';

export type AlchemySocketHandlers = {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onError: (err: Error) => void;
  onClose: (code?: number, reason?: string) => void;
};

export type AlchemySocketHandle = {
  send: (data: string) => void;
  close: () => void;
};

export type AlchemyConnectSocket = (
  url: string,
  handlers: AlchemySocketHandlers,
) => AlchemySocketHandle;

export type AlchemyProviderOptions = {
  rpcUrl: string;
  reconnectBackoffMs?: number;
  maxReconnectBackoffMs?: number;
  reconcileLimit?: number;
  reconcileIntervalMs?: number;
  /** Optional: load last known signature for bounded reconcile. */
  getCheckpointSignature?: (mint: string) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  connectSocket?: AlchemyConnectSocket;
  rpc?: SolanaRpcCall;
  autoReconnect?: boolean;
  /** Disable background reconcile loop (tests). */
  autoReconcile?: boolean;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultConnectSocket(
  url: string,
  handlers: AlchemySocketHandlers,
): AlchemySocketHandle {
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
    handlers.onError(err instanceof Error ? err : new Error('Alchemy WebSocket error'));
  });
  ws.on('close', (code, reason) => {
    handlers.onClose(code, reason?.toString());
  });
  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
  };
}

function withJitter(ms: number): number {
  return ms + Math.floor(ms * 0.2 * Math.random());
}

export class AlchemyTradeProvider implements PumpTradeProvider {
  private readonly rpcUrl: string;
  private readonly wsUrl: string;
  private readonly rpc: SolanaRpcCall;
  private readonly reconnectBackoffMs: number;
  private readonly maxReconnectBackoffMs: number;
  private readonly reconcileLimit: number;
  private readonly reconcileIntervalMs: number;
  private readonly getCheckpointSignature?: (mint: string) => Promise<string | null>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly connectSocket: AlchemyConnectSocket;
  private readonly autoReconnect: boolean;
  private readonly autoReconcile: boolean;
  private readonly rpcProviderLabel: 'alchemy' | 'other';

  private handlers: PumpTradeHandler[] = [];
  private watched = new Set<string>();
  /** mint → subscription id */
  private subscriptionByMint = new Map<string, number>();
  /** subscription id → mint */
  private mintBySubscription = new Map<number, string>();
  private pendingSubscribe = new Map<number, string>();
  private nextReqId = 1;
  private socket: AlchemySocketHandle | null = null;
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
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileInFlight = false;
  private seenSignatures = new Set<string>();

  constructor(opts: AlchemyProviderOptions) {
    if (!opts.rpcUrl.trim()) {
      throw new Error('SOLANA_RPC_URL is required for alchemy provider');
    }
    this.rpcUrl = opts.rpcUrl.trim();
    this.wsUrl = httpRpcToWsUrl(this.rpcUrl);
    this.rpc = opts.rpc ?? createSolanaRpc(this.rpcUrl);
    this.rpcProviderLabel = classifyRpcProvider(this.rpcUrl);
    this.reconnectBackoffMs = opts.reconnectBackoffMs ?? 2_000;
    this.maxReconnectBackoffMs = opts.maxReconnectBackoffMs ?? 60_000;
    this.reconcileLimit = opts.reconcileLimit ?? 80;
    this.reconcileIntervalMs = opts.reconcileIntervalMs ?? 60_000;
    this.getCheckpointSignature = opts.getCheckpointSignature;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.connectSocket = opts.connectSocket ?? defaultConnectSocket;
    this.autoReconnect = opts.autoReconnect ?? true;
    this.autoReconcile = opts.autoReconcile ?? true;
  }

  onTrade(handler: PumpTradeHandler): void {
    this.handlers.push(handler);
  }

  health(): PumpTradeProviderHealth {
    return {
      status: this.status,
      error: this.error,
      provider: 'alchemy',
      subscribedMintCount: this.subscriptionByMint.size,
      messagesReceived: this.messagesReceived,
      normalizedEvents: this.normalizedEvents,
      invalidEvents: this.invalidEvents,
      reconnectCount: this.reconnectCount,
      lastMessageAt: this.lastMessageAt,
    };
  }

  async connect(watchedMints: readonly string[]): Promise<void> {
    this.closed = false;
    this.intentionalClose = false;
    for (const mint of watchedMints) {
      this.watched.add(mint);
    }
    await this.openSocket();
    await this.reconcileAll('startup');
    if (this.autoReconcile && !this.reconcileTimer) {
      this.reconcileTimer = setInterval(() => {
        void this.reconcileAll('interval');
      }, this.reconcileIntervalMs);
      this.reconcileTimer.unref?.();
    }
  }

  async subscribeMint(mint: string): Promise<void> {
    this.watched.add(mint);
    if (this.socket && this.status !== 'disconnected' && this.status !== 'connecting') {
      this.sendSubscribe(mint);
    }
  }

  async unsubscribeMint(mint: string): Promise<void> {
    this.watched.delete(mint);
    const subId = this.subscriptionByMint.get(mint);
    if (subId != null && this.socket) {
      this.socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextReqId++,
          method: 'logsUnsubscribe',
          params: [subId],
        }),
      );
      this.subscriptionByMint.delete(mint);
      this.mintBySubscription.delete(subId);
      logJson('info', 'solana logsUnsubscribe', { mint });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.intentionalClose = true;
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.subscriptionByMint.clear();
    this.mintBySubscription.clear();
    this.pendingSubscribe.clear();
    this.status = 'disconnected';
  }

  /** Bounded reconciliation for all watched SCOOP mints. */
  async reconcileAll(reason: string = 'manual'): Promise<{ recovered: number }> {
    if (this.reconcileInFlight || this.closed) return { recovered: 0 };
    this.reconcileInFlight = true;
    let recovered = 0;
    try {
      const mints = [...this.watched];
      logJson('info', 'solana reconcile start', {
        reason,
        mintCount: mints.length,
        limit: this.reconcileLimit,
      });
      for (const mint of mints) {
        recovered += await this.reconcileMint(mint);
      }
      logJson('info', 'solana reconcile complete', { reason, recovered });
      return { recovered };
    } finally {
      this.reconcileInFlight = false;
    }
  }

  private async reconcileMint(mint: string): Promise<number> {
    const until = this.getCheckpointSignature
      ? await this.getCheckpointSignature(mint)
      : null;
    const collected: SignatureInfo[] = [];
    let before: string | undefined;
    while (collected.length < this.reconcileLimit) {
      const page = await getSignaturesForAddress(this.rpc, mint, {
        limit: Math.min(50, this.reconcileLimit - collected.length),
        before,
        until: until ?? undefined,
      });
      if (page.length === 0) break;
      collected.push(...page);
      before = page[page.length - 1]?.signature;
      if (page.length < 50) break;
    }

    // Oldest first so market state / candles build correctly.
    const ordered = [...collected].sort((a, b) => a.slot - b.slot || a.signature.localeCompare(b.signature));
    let recovered = 0;
    for (const info of ordered) {
      if (info.err != null) continue;
      const n = await this.processSignature(mint, info.signature, 'reconcile');
      recovered += n;
    }
    return recovered;
  }

  private async openSocket(): Promise<void> {
    if (this.closed) return;
    this.status = 'connecting';
    this.error = null;
    logJson('info', 'solana alchemy connecting', {
      rpcProvider: this.rpcProviderLabel,
      watchedMintCount: this.watched.size,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = this.connectSocket(this.wsUrl, {
        onOpen: () => {
          this.socket = socket;
          this.status = 'connected';
          this.reconnectAttempt = 0;
          this.error = null;
          logJson('info', 'solana alchemy connected', {
            rpcProvider: this.rpcProviderLabel,
          });
          for (const mint of this.watched) {
            this.sendSubscribe(mint);
          }
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
          this.status = 'error';
          logJson('error', 'solana alchemy socket error', { error: err.message });
          if (!settled) {
            settled = true;
            reject(err);
          }
        },
        onClose: (code, reason) => {
          this.socket = null;
          this.subscriptionByMint.clear();
          this.mintBySubscription.clear();
          this.pendingSubscribe.clear();
          if (this.intentionalClose || this.closed) {
            this.status = 'disconnected';
            return;
          }
          this.status = 'reconnecting';
          logJson('warn', 'solana alchemy disconnected', { code, reason: reason ?? null });
          void this.scheduleReconnect();
        },
      });
    });
  }

  private sendSubscribe(mint: string): void {
    if (!this.socket) return;
    if (this.subscriptionByMint.has(mint)) return;
    const id = this.nextReqId++;
    this.pendingSubscribe.set(id, mint);
    this.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'logsSubscribe',
        params: [{ mentions: [mint] }, { commitment: 'confirmed' }],
      }),
    );
    logJson('info', 'solana logsSubscribe', { mint, commitment: 'confirmed' });
  }

  private async scheduleReconnect(): Promise<void> {
    if (!this.autoReconnect || this.closed || this.intentionalClose) return;
    this.reconnectCount += 1;
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.maxReconnectBackoffMs,
      withJitter(this.reconnectBackoffMs * 2 ** Math.min(this.reconnectAttempt - 1, 5)),
    );
    logJson('info', 'solana alchemy reconnect scheduled', { delayMs: delay });
    await this.sleep(delay);
    if (this.closed || this.intentionalClose) return;
    try {
      await this.openSocket();
      await this.reconcileAll('reconnect');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error = message;
      logJson('error', 'solana alchemy reconnect failed', { error: message });
      void this.scheduleReconnect();
    }
  }

  private async handleMessage(data: string): Promise<void> {
    this.messagesReceived += 1;
    this.lastMessageAt = this.now().toISOString();

    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      this.invalidEvents += 1;
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const obj = msg as Record<string, unknown>;

    // Subscription ack
    if ('id' in obj && 'result' in obj && typeof obj.id === 'number') {
      const mint = this.pendingSubscribe.get(obj.id);
      if (mint && typeof obj.result === 'number') {
        this.pendingSubscribe.delete(obj.id);
        this.subscriptionByMint.set(mint, obj.result);
        this.mintBySubscription.set(obj.result, mint);
        this.status = 'subscribed';
        logJson('info', 'solana logsSubscribe ack', {
          mint,
          subscriptionId: obj.result,
          subscribedMintCount: this.subscriptionByMint.size,
        });
      }
      return;
    }

    if (obj.method !== 'logsNotification') return;

    const params = obj.params as
      | {
          subscription?: number;
          result?: {
            value?: { signature?: string; err?: unknown; logs?: string[] };
          };
        }
      | undefined;
    const subscription = params?.subscription;
    const value = params?.result?.value;
    const signature = value?.signature;
    if (subscription == null || !signature) return;
    if (value?.err != null) return;

    const mint = this.mintBySubscription.get(subscription);
    if (!mint) return;

    logJson('info', 'solana trade observed', { mint, signature });
    await this.processSignature(mint, signature, 'websocket');
  }

  private async processSignature(
    mint: string,
    signature: string,
    origin: 'websocket' | 'reconcile',
  ): Promise<number> {
    const dedupeKey = `${mint}:${signature}`;
    if (this.seenSignatures.has(dedupeKey)) {
      return 0;
    }
    // Soft in-memory dedupe; durable dedupe is DB unique key.
    this.seenSignatures.add(dedupeKey);
    if (this.seenSignatures.size > 5_000) {
      const first = this.seenSignatures.values().next().value;
      if (first) this.seenSignatures.delete(first);
    }

    let tx;
    try {
      tx = await getTransaction(this.rpc, signature);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logJson('warn', 'solana tx fetch failed', { mint, signature, error: message, origin });
      this.seenSignatures.delete(dedupeKey);
      return 0;
    }

    logJson('info', 'solana tx fetched', { mint, signature, origin, hasTx: Boolean(tx) });
    const decoded = decodeAlchemyPumpTrades(tx, { mint, signature });
    if (!decoded.ok) {
      // Non-trade mint mentions (ATA init, failed attempts) are expected.
      if (
        decoded.error !== 'no mint token balance change' &&
        decoded.error !== 'no pump program participation' &&
        decoded.error !== 'failed transaction'
      ) {
        this.invalidEvents += 1;
        logJson('warn', 'solana trade decode skipped', {
          mint,
          signature,
          error: decoded.error,
          origin,
        });
      }
      return 0;
    }

    let emitted = 0;
    for (const event of decoded.events) {
      this.normalizedEvents += 1;
      logJson('info', 'solana trade decoded', {
        mint: event.mint,
        signature: event.signature,
        side: event.side,
        eventIndex: event.eventIndex,
        solAmount: event.solAmount,
        origin,
      });
      for (const handler of this.handlers) {
        await handler(event);
      }
      emitted += 1;
    }
    return emitted;
  }
}
