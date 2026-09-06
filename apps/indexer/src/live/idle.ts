import type { IndexerConfig } from '../config.js';
import { publicConfigView } from '../config.js';

export interface IdleModeOptions {
  /** Injected sleep — default is setTimeout promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Idle poll interval (ms). Default 30s — not a busy loop. */
  intervalMs?: number;
  /** Optional abort for tests (resolves → stop). */
  signal?: AbortSignal;
  /** Override process signal wiring (tests). */
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
 * Render-safe disabled worker: stay alive with zero chain ingest / DB writes.
 * Does not connect to RPC or Postgres. Exits 0 on SIGTERM/SIGINT.
 */
export async function runDisabledIdleMode(
  config: IndexerConfig,
  opts: IdleModeOptions = {},
): Promise<IdleModeResult> {
  if (config.SCOOP_INDEXING_ENABLED) {
    throw new Error('runDisabledIdleMode called while SCOOP_INDEXING_ENABLED=true');
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

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      message: 'indexer disabled — idle mode',
      phase: '6A.7',
      indexingEnabled: false,
      note: 'No RPC ingest, no block processing, no projection writes',
      config: publicConfigView(config),
      idleIntervalMs: intervalMs,
    }),
  );

  try {
    while (!stopReason) {
      await sleep(intervalMs);
      if (stopReason) break;
      ticks += 1;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          message: 'indexer idle heartbeat',
          indexingEnabled: false,
          ticks,
        }),
      );
    }
  } finally {
    cleanupSignals();
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      message: 'indexer idle shutdown',
      reason: stopReason ?? 'unknown',
      ticks,
    }),
  );

  return { reason: stopReason ?? 'unknown', ticks };
}
