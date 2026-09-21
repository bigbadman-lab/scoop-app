import { describe, expect, it, vi } from 'vitest';
import { runDisabledIdleMode } from './idle.js';
import { loadConfig } from './config.js';

describe('disabled idle safety', () => {
  it('makes zero RPC/provider/DB calls while disabled', async () => {
    const rpc = vi.fn();
    const dbWrite = vi.fn();
    const config = loadConfig({ SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'false' });

    const ac = new AbortController();
    let ticksSeen = 0;
    const sleep = vi.fn(async () => {
      ticksSeen += 1;
      if (ticksSeen >= 2) ac.abort();
    });

    const result = await runDisabledIdleMode(config, {
      sleep,
      intervalMs: 1,
      signal: ac.signal,
      onSignals: () => () => {},
    });

    expect(result.ticks).toBeGreaterThanOrEqual(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it('refuses idle mode when enabled', async () => {
    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      DATABASE_URL: 'postgres://localhost/test',
    });
    await expect(runDisabledIdleMode(config)).rejects.toThrow(/indexing enabled/);
  });
});
