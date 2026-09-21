import type { SolanaPumpWorkerConfig } from './config.js';
import { publicConfigView } from './config.js';
import { logJson } from './log.js';

export interface IdleModeOptions {
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  signal?: AbortSignal;
  onSignals?: (handler: (sig: string) => void) => () => void;
}

export interface IdleModeResult {
  reason: string;
  ticks: number;
}

const DEFAULT_IDLE_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultOnSignals(handler: (sig: string) => void): () => void {
  const wrap = (sig: string) => () => handler(sig);
  const onTerm = wrap('SIGTERM');
  const onInt = wrap('SIGINT');
  process.once('SIGTERM', onTerm);
  process.once('SIGINT', onInt);
  return () => {
    process.removeListener('SIGTERM', onTerm);
    process.removeListener('SIGINT', onInt);
  };
}

/**
 * Disabled worker: stay alive with zero RPC / provider / DB writes.
 */
export async function runDisabledIdleMode(
  config: SolanaPumpWorkerConfig,
  opts: IdleModeOptions = {},
): Promise<IdleModeResult> {
  if (config.indexingEnabled) {
    throw new Error('runDisabledIdleMode called while indexing enabled');
  }

  const sleep = opts.sleep ?? defaultSleep;
  const intervalMs = opts.intervalMs ?? DEFAULT_IDLE_MS;
  const onSignals = opts.onSignals ?? defaultOnSignals;

  let stopReason: string | null = null;
  let ticks = 0;

  const cleanupSignals = onSignals((sig) => {
    stopReason = sig;
  });

  if (opts.signal) {
    if (opts.signal.aborted) {
      stopReason = 'abort';
    } else {
      opts.signal.addEventListener(
        'abort',
        () => {
          stopReason = 'abort';
        },
        { once: true },
      );
    }
  }

  logJson('info', 'solana-pump-worker disabled — idle mode', {
    indexingEnabled: false,
    note: 'No RPC, no provider calls, no DB writes',
    config: publicConfigView(config),
    idleIntervalMs: intervalMs,
  });

  try {
    while (!stopReason) {
      await sleep(intervalMs);
      if (stopReason) break;
      ticks += 1;
      logJson('info', 'solana-pump-worker idle heartbeat', {
        indexingEnabled: false,
        ticks,
      });
    }
  } finally {
    cleanupSignals();
  }

  logJson('info', 'solana-pump-worker idle shutdown', {
    reason: stopReason ?? 'unknown',
    ticks,
  });

  return { reason: stopReason ?? 'unknown', ticks };
}
