import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView, resolveIndexerLockDatabaseUrl } from './config.js';

describe('indexer config', () => {
  it('defaults indexing to disabled with canonical start block', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
    });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(false);
    expect(config.SCOOP_START_BLOCK).toBe(60525572);
    expect(publicConfigView(config).indexingEnabled).toBe(false);
    expect(publicConfigView(config).startBlock).toBe(60525572);
  });

  it('uses the public Supabase origin when SUPABASE_URL is unset', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      NEXT_PUBLIC_SUPABASE_URL: 'https://public-project.supabase.co',
    });

    expect(config.SUPABASE_URL).toBe('https://public-project.supabase.co');
  });

  it('derives the public Supabase origin from DATABASE_URL when unset', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      DATABASE_URL: 'postgresql://postgres:secret@db.hmqfzilijidiqtignamz.supabase.co:5432/postgres',
    });

    expect(config.SUPABASE_URL).toBe('https://hmqfzilijidiqtignamz.supabase.co');
    expect(publicConfigView(config).hasSupabaseUrl).toBe(true);
  });

  it('rejects start block below canonical indexingStartBlock', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        SCOOP_START_BLOCK: '55863290',
      }),
    ).toThrow(/canonical indexingStartBlock/);
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
    expect(config.SCOOP_POLL_INTERVAL_MS).toBe(5000);
    expect(config.SCOOP_LIVE_POLL_MS).toBe(5000);
    expect(config.SCOOP_LIVE_OVERLAY_ENABLED).toBe(true);
    expect(config.SCOOP_VOLUME_24H_SWEEP_SECONDS).toBe(60);
    expect(publicConfigView(config).volume24hSweepSeconds).toBe(60);
    expect(publicConfigView(config).pollIntervalMs).toBe(5000);
    expect(publicConfigView(config).livePollMs).toBe(5000);
    expect(publicConfigView(config).liveOverlayEnabled).toBe(true);
    expect(config.SCOOP_LIVE_MAX_CATCHUP_BLOCKS).toBe(512);
    expect(config.SCOOP_LIVE_REPLAY_WINDOW_BLOCKS).toBe(192);
    expect(config.SCOOP_LIVE_STALE_LAG_BLOCKS).toBe(256);
    expect(publicConfigView(config).liveMaxCatchupBlocks).toBe(512);
    expect(publicConfigView(config).liveReplayWindowBlocks).toBe(192);
    expect(publicConfigView(config).liveStaleLagBlocks).toBe(256);
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
