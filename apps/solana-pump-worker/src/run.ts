/**
 * Enabled worker loop: watchlist refresh + Alchemy (or mock) provider fan-in.
 */

import {
  createPool,
  getPumpWorkerCheckpoint,
  listPumpWatchlist,
  type Pool,
  type PumpWatchlistItem,
} from '@scoop/db';
import type { SolanaPumpWorkerConfig } from './config.js';
import { publicConfigView } from './config.js';
import { createHealthState, type WorkerHealthState } from './health.js';
import { ingestNormalizedPumpTrade } from './ingest.js';
import { logJson } from './log.js';
import {
  createHolderRefreshRpc,
  refreshPumpHolderCounts,
} from './holders/refresh.js';
import { AlchemyTradeProvider } from './provider/alchemy.js';
import { MockPumpTradeProvider } from './provider/mock.js';
import type { NormalizedPumpTradeEvent, PumpTradeProvider } from './provider/types.js';

export type RunWorkerOptions = {
  signal?: AbortSignal;
  /** Inject provider (tests). */
  provider?: PumpTradeProvider;
  /** Inject pool (tests). */
  pool?: Pool;
  sleep?: (ms: number) => Promise<void>;
  /** When true, return after first watchlist load (tests). */
  once?: boolean;
};

export type RunWorkerResult = {
  health: WorkerHealthState;
  provider: PumpTradeProvider;
  pool: Pool;
  stop: () => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createProvider(config: SolanaPumpWorkerConfig, pool: Pool): PumpTradeProvider {
  if (config.tradeProvider === 'mock') {
    return new MockPumpTradeProvider();
  }
  if (config.tradeProvider === 'alchemy') {
    if (!config.solanaRpcUrl) {
      throw new Error('SOLANA_RPC_URL required');
    }
    return new AlchemyTradeProvider({
      rpcUrl: config.solanaRpcUrl,
      reconnectBackoffMs: config.reconnectBackoffMs,
      maxReconnectBackoffMs: config.maxReconnectBackoffMs,
      reconcileIntervalMs: config.reconcileIntervalMs,
      reconcileLimit: config.reconcileLimit,
      getCheckpointSignature: async (mint) => {
        const row = await getPumpWorkerCheckpoint(pool, mint);
        return row?.lastSignature ?? null;
      },
    });
  }
  throw new Error(`Unsupported trade provider: ${String(config.tradeProvider)}`);
}

function syncProviderHealth(health: WorkerHealthState, provider: PumpTradeProvider): void {
  const h = provider.health();
  health.providerStatus = h.status;
  health.subscribedMintCount = h.subscribedMintCount ?? 0;
  health.messagesReceived = h.messagesReceived ?? health.messagesReceived;
  health.eventsNormalized = h.normalizedEvents ?? health.eventsNormalized;
  health.invalidEvents = h.invalidEvents ?? health.invalidEvents;
  health.reconnectCount = h.reconnectCount ?? health.reconnectCount;
  health.lastMessageAt = h.lastMessageAt ?? health.lastMessageAt;
  if (h.error) health.currentError = h.error;
}

export async function runPumpMarketDataWorker(
  config: SolanaPumpWorkerConfig,
  opts: RunWorkerOptions = {},
): Promise<RunWorkerResult> {
  if (!config.indexingEnabled) {
    throw new Error('runPumpMarketDataWorker requires SCOOP_SOLANA_PUMP_INDEXING_ENABLED=true');
  }
  if (!config.databaseUrl && !opts.pool) {
    throw new Error('DATABASE_URL required');
  }

  const health = createHealthState(true, config.tradeProvider);
  const pool = opts.pool ?? createPool(config.databaseUrl!);
  const provider = opts.provider ?? createProvider(config, pool);
  const sleep = opts.sleep ?? defaultSleep;
  const ownPool = !opts.pool;

  let watchByMint = new Map<string, PumpWatchlistItem>();
  let stopped = false;

  async function refreshWatchlist(): Promise<void> {
    const items = await listPumpWatchlist(pool);
    const next = new Map(items.map((i) => [i.mint, i]));
    const prev = watchByMint;

    for (const mint of next.keys()) {
      if (!prev.has(mint)) {
        await provider.subscribeMint(mint);
      }
    }
    for (const mint of prev.keys()) {
      if (!next.has(mint)) {
        await provider.unsubscribeMint(mint);
      }
    }

    watchByMint = next;
    health.watchlistSize = next.size;
    syncProviderHealth(health, provider);
    logJson('info', 'pump watchlist refreshed', {
      watchlistSize: next.size,
      subscribedMintCount: health.subscribedMintCount,
    });
  }

  provider.onTrade(async (event: NormalizedPumpTradeEvent) => {
    health.eventsReceived += 1;
    health.lastEventAt = event.blockTime.toISOString();
    syncProviderHealth(health, provider);
    try {
      const result = await ingestNormalizedPumpTrade(
        {
          pool,
          resolveWatchItem: (mint) => watchByMint.get(mint) ?? null,
        },
        event,
      );
      if (!result.ok) {
        health.currentError = result.error;
        logJson('warn', 'pump trade rejected', {
          mint: event.mint,
          signature: event.signature,
          error: result.error,
        });
        return;
      }
      if (!result.inserted) {
        health.duplicatesSkipped += 1;
        logJson('info', 'pump trade duplicate skipped', {
          mint: event.mint,
          signature: event.signature,
          eventIndex: event.eventIndex,
        });
        return;
      }
      health.eventsPersisted += 1;
      health.lastPersistedAt = event.blockTime.toISOString();
      health.currentError = null;
      health.checkpointStatus = event.signature;
      logJson('info', 'solana trade persisted', {
        mint: event.mint,
        signature: event.signature,
        side: event.side,
        solAmount: event.solAmount,
        eventIndex: event.eventIndex,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      health.currentError = message;
      logJson('error', 'pump trade ingest failed', {
        mint: event.mint,
        signature: event.signature,
        error: message,
      });
    }
  });

  logJson('info', 'solana-pump-worker starting', {
    config: publicConfigView(config),
    liveTradeSource: 'ALCHEMY_SOLANA_RPC',
  });

  health.providerStatus = 'connecting';
  await refreshWatchlist();
  await provider.connect([...watchByMint.keys()]);
  syncProviderHealth(health, provider);

  const stop = async () => {
    stopped = true;
    await provider.close();
    if (ownPool) {
      await pool.end();
    }
    health.providerStatus = 'disconnected';
  };

  if (opts.signal) {
    opts.signal.addEventListener(
      'abort',
      () => {
        void stop();
      },
      { once: true },
    );
  }

  if (opts.once) {
    return { health, provider, pool, stop };
  }

  void (async () => {
    while (!stopped) {
      await sleep(config.watchlistRefreshMs);
      if (stopped) break;
      try {
        await refreshWatchlist();
        syncProviderHealth(health, provider);
        logJson('info', 'pump worker heartbeat', {
          providerStatus: health.providerStatus,
          watchlistSize: health.watchlistSize,
          subscribedMintCount: health.subscribedMintCount,
          messagesReceived: health.messagesReceived,
          eventsNormalized: health.eventsNormalized,
          eventsPersisted: health.eventsPersisted,
          duplicatesSkipped: health.duplicatesSkipped,
          invalidEvents: health.invalidEvents,
          reconnectCount: health.reconnectCount,
          lastMessageAt: health.lastMessageAt,
          currentError: health.currentError,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        health.currentError = message;
        logJson('error', 'watchlist refresh failed', { error: message });
      }
    }
  })();

  // Holder enumeration — independent of trade decode / watchlist loop.
  if (config.solanaRpcUrl) {
    const holderRpc = createHolderRefreshRpc(config.solanaRpcUrl);
    void (async () => {
      // First cycle shortly after start so canaries do not wait a full interval.
      await sleep(Math.min(15_000, config.holderRefreshMs));
      while (!stopped) {
        try {
          const result = await refreshPumpHolderCounts({
            db: pool,
            rpc: holderRpc,
            getMints: () => [...watchByMint.keys()],
          });
          logJson('info', 'pump holder refresh cycle', result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logJson('error', 'pump holder refresh cycle failed', { error: message });
        }
        await sleep(config.holderRefreshMs);
        if (stopped) break;
      }
    })();
  }

  return { health, provider, pool, stop };
}
