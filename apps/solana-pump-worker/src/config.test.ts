import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView } from './config.js';

describe('solana-pump-worker config', () => {
  it('defaults indexing disabled', () => {
    const config = loadConfig({});
    expect(config.indexingEnabled).toBe(false);
    expect(config.tradeProvider).toBe('mock');
    expect(config.chainId).toBe(900001);
    expect(publicConfigView(config).hasDatabaseUrl).toBe(false);
    expect(publicConfigView(config).hasSolanaRpcUrl).toBe(false);
  });

  it('requires DATABASE_URL when enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('allows alchemy provider and requires SOLANA_RPC_URL when enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
        SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'alchemy',
        DATABASE_URL: 'postgres://localhost/db',
      }),
    ).toThrow(/SOLANA_RPC_URL/);

    const config = loadConfig({
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'true',
      SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'alchemy',
      DATABASE_URL: 'postgres://localhost/db',
      SOLANA_RPC_URL: 'https://solana-mainnet.g.alchemy.com/v2/test-key',
    });
    expect(config.tradeProvider).toBe('alchemy');
    expect(config.solanaRpcUrl).toContain('alchemy.com');
    const pub = publicConfigView(config);
    expect(JSON.stringify(pub)).not.toContain('test-key');
    expect(pub.hasSolanaRpcUrl).toBe(true);
    expect(pub.solanaRpcProvider).toBe('alchemy');
  });

  it('rejects pumpportal and unknown providers', () => {
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'pumpportal',
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        SCOOP_SOLANA_PUMP_TRADE_PROVIDER: 'helius',
      }),
    ).toThrow();
  });

  it('never exposes secrets in public view', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://secret:pass@localhost/db',
      SOLANA_RPC_URL: 'https://solana-mainnet.g.alchemy.com/v2/super-secret',
      SCOOP_SOLANA_PUMP_INDEXING_ENABLED: 'false',
    });
    const pub = publicConfigView(config);
    expect(JSON.stringify(pub)).not.toContain('secret');
    expect(JSON.stringify(pub)).not.toContain('postgres://');
    expect(JSON.stringify(pub)).not.toContain('super-secret');
    expect(pub.hasDatabaseUrl).toBe(true);
    expect(pub.hasSolanaRpcUrl).toBe(true);
  });
});
