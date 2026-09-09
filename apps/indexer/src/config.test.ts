import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView, resolveIndexerLockDatabaseUrl } from './config.js';

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

  it('accepts indexing when RPC and DATABASE_URL set (non-production)', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'true',
      ROBINHOOD_RPC_URL: 'https://example.com',
      DATABASE_URL: 'postgres://localhost/scoop',
    });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(true);
    expect(config.SCOOP_POLL_INTERVAL_MS).toBe(2000);
    expect(config.INDEXER_LOCK_RETRY_MS).toBe(5000);
    expect(config.INDEXER_LOCK_WAIT_TIMEOUT_MS).toBe(120_000);
    expect(resolveIndexerLockDatabaseUrl(config)).toBe('postgres://localhost/scoop');
  });

  it('requires INDEXER_LOCK_DATABASE_URL in production when indexing', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SCOOP_CHAIN_ID: '4663',
        SCOOP_INDEXING_ENABLED: 'true',
        ROBINHOOD_RPC_URL: 'https://example.com',
        DATABASE_URL: 'postgres://pooler/scoop',
      }),
    ).toThrow(/INDEXER_LOCK_DATABASE_URL/);
  });

  it('accepts production indexing with dedicated lock URL', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      SCOOP_CHAIN_ID: '4663',
      SCOOP_INDEXING_ENABLED: 'true',
      ROBINHOOD_RPC_URL: 'https://example.com',
      DATABASE_URL: 'postgres://pooler/scoop',
      INDEXER_LOCK_DATABASE_URL: 'postgres://direct/scoop',
      INDEXER_LOCK_RETRY_MS: '3000',
      INDEXER_LOCK_WAIT_TIMEOUT_MS: '60000',
    });
    expect(resolveIndexerLockDatabaseUrl(config)).toBe('postgres://direct/scoop');
    expect(config.INDEXER_LOCK_RETRY_MS).toBe(3000);
    expect(config.INDEXER_LOCK_WAIT_TIMEOUT_MS).toBe(60_000);
    expect(publicConfigView(config).hasIndexerLockDatabaseUrl).toBe(true);
    expect(JSON.stringify(publicConfigView(config))).not.toContain('postgres://');
  });

  it('rejects non-positive lock retry/timeout env values', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        INDEXER_LOCK_RETRY_MS: '0',
      }),
    ).toThrow(/Invalid positive integer/);

    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        INDEXER_LOCK_WAIT_TIMEOUT_MS: '-5',
      }),
    ).toThrow(/Invalid positive integer/);
  });
});
