import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView } from './config.js';

describe('solana-pump-worker config', () => {
  it('defaults indexing disabled', () => {
    const config = loadConfig({});
    expect(config.indexingEnabled).toBe(false);
    expect(config.tradeProvider).toBe('mock');
    expect(config.chainId).toBe(900001);
    expect(publicConfigView(config).hasDatabaseUrl).toBe(false);
    expect(publicConfigView(config).hasPumpPortalApiKey).toBe(false);
  });

  it('requires DATABASE_URL when enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('allows pumpportal provider and requires API key when enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
        SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'pumpportal',
        DATABASE_URL: 'postgres://localhost/db',
      }),
    ).toThrow(/PUMPPORTAL_API_KEY/);

    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'pumpportal',
      DATABASE_URL: 'postgres://localhost/db',
      PUMPPORTAL_API_KEY: 'pk_test',
    });
    expect(config.tradeProvider).toBe('pumpportal');
    expect(config.pumpPortalApiKey).toBe('pk_test');
    expect(JSON.stringify(publicConfigView(config))).not.toContain('pk_test');
    expect(publicConfigView(config).hasPumpPortalApiKey).toBe(true);
  });

  it('rejects unknown providers', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'helius',
      }),
    ).toThrow();
  });

  it('never exposes secrets in public view', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://secret:pass@localhost/db',
      PUMPPORTAL_API_KEY: 'super-secret',
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'false',
    });
    const pub = publicConfigView(config);
    expect(JSON.stringify(pub)).not.toContain('secret');
    expect(JSON.stringify(pub)).not.toContain('postgres://');
    expect(JSON.stringify(pub)).not.toContain('super-secret');
    expect(pub.hasDatabaseUrl).toBe(true);
  });
});
