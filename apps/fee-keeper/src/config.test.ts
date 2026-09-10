import { describe, expect, it } from 'vitest';
import { loadFeeKeeperConfig } from './config.js';
import { privateKeyToAccount } from 'viem/accounts';

const PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
    DATABASE_URL: 'postgres://localhost/scoop',
    ...overrides,
  };
}

describe('loadFeeKeeperConfig', () => {
  it('defaults writeEnabled to false when unset', () => {
    const cfg = loadFeeKeeperConfig(baseEnv());
    expect(cfg.writeEnabled).toBe(false);
    expect(cfg.mode).toBe('dry-run');
    expect(cfg.privateKey).toBeNull();
    expect(cfg.cronWindowMinutes).toBe(15);
    expect(cfg.activityLookbackMinutes).toBe(120);
    expect(cfg.fallbackSweepMinutes).toBe(1440);
  });

  it('parses SCOOP_FEE_KEEPER_CRON_WINDOW_MINUTES', () => {
    const cfg = loadFeeKeeperConfig(
      baseEnv({ SCOOP_FEE_KEEPER_CRON_WINDOW_MINUTES: '15' }),
    );
    expect(cfg.cronWindowMinutes).toBe(15);
  });

  it('rejects non-positive cron window minutes', () => {
    expect(() =>
      loadFeeKeeperConfig(baseEnv({ SCOOP_FEE_KEEPER_CRON_WINDOW_MINUTES: '0' })),
    ).toThrow(/CRON_WINDOW_MINUTES/);
  });

  it('treats WRITE_ENABLED=false explicitly', () => {
    const cfg = loadFeeKeeperConfig(
      baseEnv({ SCOOP_FEE_KEEPER_WRITE_ENABLED: 'false' }),
    );
    expect(cfg.writeEnabled).toBe(false);
  });

  it('requires PK + address pin when writes enabled', () => {
    expect(() =>
      loadFeeKeeperConfig(baseEnv({ SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true' })),
    ).toThrow(/PRIVATE_KEY/);
  });

  it('FATAL on signer mismatch', () => {
    const derived = privateKeyToAccount(PK).address;
    expect(() =>
      loadFeeKeeperConfig(
        baseEnv({
          SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
          SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
          SCOOP_FEE_KEEPER_ADDRESS: '0x0000000000000000000000000000000000000001',
        }),
      ),
    ).toThrow(/does not match/);
    // control: matching pin works
    const cfg = loadFeeKeeperConfig(
      baseEnv({
        SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
        SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
        SCOOP_FEE_KEEPER_ADDRESS: derived,
      }),
    );
    expect(cfg.writeEnabled).toBe(true);
    expect(cfg.expectedKeeperAddress).toBe(derived.toLowerCase());
  });

  it('dry-run with PK+pin validates match but does not retain PK for writes', () => {
    const derived = privateKeyToAccount(PK).address;
    const cfg = loadFeeKeeperConfig(
      baseEnv({
        SCOOP_FEE_KEEPER_WRITE_ENABLED: 'false',
        SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
        SCOOP_FEE_KEEPER_ADDRESS: derived,
      }),
    );
    expect(cfg.writeEnabled).toBe(false);
    expect(cfg.mode).toBe('dry-run');
    expect(cfg.expectedKeeperAddress).toBe(derived.toLowerCase());
    expect(cfg.privateKey).toBeNull();
  });

  it('dry-run with PK + wrong pin is FATAL', () => {
    expect(() =>
      loadFeeKeeperConfig(
        baseEnv({
          SCOOP_FEE_KEEPER_WRITE_ENABLED: 'false',
          SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
          SCOOP_FEE_KEEPER_ADDRESS: '0x0000000000000000000000000000000000000001',
        }),
      ),
    ).toThrow(/does not match/);
  });

  it('FATAL on wrong configured chain id', () => {
    expect(() =>
      loadFeeKeeperConfig(baseEnv({ SCOOP_FEE_KEEPER_CHAIN_ID: '1' })),
    ).toThrow(/CHAIN_ID must be 4663/);
  });
});
