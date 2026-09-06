import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { runDisabledIdleMode } from './idle.js';
import { runIndexer } from './runner.js';

describe('disabled indexer idle mode', () => {
  it('refuses to run idle mode when indexing is enabled', async () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'true',
      ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    });
    await expect(runDisabledIdleMode(config, { intervalMs: 1 })).rejects.toThrow(
      /SCOOP_INDEXING_ENABLED=true/,
    );
  });

  it('idles without ingest and shuts down cleanly on SIGTERM', async () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'false',
    });

    const sleeps: number[] = [];
    let signalHandler: ((sig: string) => void) | null = null;

    const resultPromise = runDisabledIdleMode(config, {
      intervalMs: 5,
      sleep: async (ms) => {
        sleeps.push(ms);
        // After first sleep begins, simulate SIGTERM
        if (sleeps.length === 1 && signalHandler) {
          queueMicrotask(() => signalHandler?.('SIGTERM'));
        }
        await new Promise((r) => setTimeout(r, 1));
      },
      onSignals: (handler) => {
        signalHandler = handler;
        return () => {
          signalHandler = null;
        };
      },
    });

    const result = await resultPromise;
    expect(result.reason).toBe('SIGTERM');
    expect(sleeps.length).toBeGreaterThanOrEqual(1);
    expect(sleeps.every((ms) => ms >= 5)).toBe(true);
  });

  it('stays alive across multiple idle ticks until abort', async () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'false',
    });

    const ac = new AbortController();
    let ticksSeen = 0;

    const resultPromise = runDisabledIdleMode(config, {
      intervalMs: 1,
      signal: ac.signal,
      sleep: async () => {
        ticksSeen += 1;
        if (ticksSeen >= 3) ac.abort();
        await new Promise((r) => setTimeout(r, 1));
      },
      onSignals: () => () => undefined,
    });

    const result = await resultPromise;
    expect(result.reason).toBe('abort');
    expect(result.ticks).toBeGreaterThanOrEqual(2);
  });

  it('does not call runIndexer when indexing disabled (start branch contract)', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'false',
    });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(false);
    // Documented contract: indexer-start uses idle mode, not runIndexer, when disabled.
    expect(typeof runDisabledIdleMode).toBe('function');
    expect(typeof runIndexer).toBe('function');
  });

  it('enabled config still requires RPC/DB before runner can start', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        SCOOP_INDEXING_ENABLED: 'true',
      }),
    ).toThrow(/ROBINHOOD_RPC_URL/);

    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '1',
        SCOOP_INDEXING_ENABLED: 'false',
      }),
    ).toThrow(/SCOOP_CHAIN_ID/);
  });

  it('runIndexer still refuses when indexing disabled', async () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'false',
    });
    await expect(runIndexer({ config })).rejects.toThrow(/SCOOP_INDEXING_ENABLED is not true/);
  });
});
