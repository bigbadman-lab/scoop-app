import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView } from './config.js';

describe('indexer config', () => {
  it('defaults indexing to disabled', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
    });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(false);
    expect(publicConfigView(config).indexingEnabled).toBe(false);
  });

  it('refuses wrong chain ID', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '1',
      }),
    ).toThrow(/SCOOP_CHAIN_ID must be 4663/);
  });

  it('requires RPC and DB when indexing enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        SCOOP_INDEXING_ENABLED: 'true',
      }),
    ).toThrow(/ROBINHOOD_RPC_URL/);

    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        SCOOP_INDEXING_ENABLED: 'true',
        ROBINHOOD_RPC_URL: 'https://example.com',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('accepts indexing when RPC and DATABASE_URL set', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'true',
      ROBINHOOD_RPC_URL: 'https://example.com',
      DATABASE_URL: 'postgres://localhost/scoop',
    });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(true);
    expect(config.SCOOP_POLL_INTERVAL_MS).toBe(2000);
  });
});
