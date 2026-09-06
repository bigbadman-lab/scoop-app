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
  });
});
