import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFeeKeeperConfig,
  publicConfigView,
  resolveDeploymentFactory,
} from './config.js';
import { historicalTestCanaryManifest } from '@scoop/shared';
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

describe('deployment mode safety', () => {
  it('local dry-run may default to historical-test when mode unset', () => {
    const cfg = loadFeeKeeperConfig(baseEnv({ NODE_ENV: 'development' }));
    expect(cfg.deploymentMode).toBe('historical-test');
    expect(cfg.factoryAddress?.toLowerCase()).toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );
    const view = publicConfigView(cfg);
    expect(view.deploymentMode).toBe('historical-test');
    expect(view.factoryAddress).toBe(cfg.factoryAddress);
  });

  it('NODE_ENV=production refuses silent historical default', () => {
    expect(() =>
      loadFeeKeeperConfig(baseEnv({ NODE_ENV: 'production' })),
    ).toThrow(/DEPLOYMENT_MODE is required/);
  });

  it('write mode refuses silent historical default', () => {
    const derived = privateKeyToAccount(PK).address;
    expect(() =>
      loadFeeKeeperConfig(
        baseEnv({
          SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
          SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
          SCOOP_FEE_KEEPER_ADDRESS: derived,
        }),
      ),
    ).toThrow(/DEPLOYMENT_MODE is required/);
  });

  it('write + historical-test requires explicit allow flag', () => {
    const derived = privateKeyToAccount(PK).address;
    expect(() =>
      loadFeeKeeperConfig(
        baseEnv({
          SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
          SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'historical-test',
          SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
          SCOOP_FEE_KEEPER_ADDRESS: derived,
        }),
      ),
    ).toThrow(/ALLOW_HISTORICAL_WRITES/);
  });

  it('write + historical-test allowed only with escape hatch', () => {
    const derived = privateKeyToAccount(PK).address;
    const cfg = loadFeeKeeperConfig(
      baseEnv({
        SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
        SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'historical-test',
        SCOOP_FEE_KEEPER_ALLOW_HISTORICAL_WRITES: 'true',
        SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
        SCOOP_FEE_KEEPER_ADDRESS: derived,
      }),
    );
    expect(cfg.deploymentMode).toBe('historical-test');
    expect(cfg.writeEnabled).toBe(true);
  });

  it('explicit historical-test is allowed for dry-run', () => {
    const cfg = loadFeeKeeperConfig(
      baseEnv({ SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'historical-test' }),
    );
    expect(cfg.deploymentMode).toBe('historical-test');
  });

  it('canonical-production resolves P10.3 Factory with no historical fallback', () => {
    const resolved = resolveDeploymentFactory('canonical-production');
    expect(resolved.factoryAddress?.toLowerCase()).toBe(
      '0x4b227d5e6199f42cea4e638875ff8c740757dd3c',
    );
    expect(resolved.factoryAddress?.toLowerCase()).not.toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );
    const cfg = loadFeeKeeperConfig(
      baseEnv({ SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'canonical-production' }),
    );
    expect(cfg.deploymentMode).toBe('canonical-production');
    expect(cfg.factoryAddress?.toLowerCase()).toBe(
      '0x4b227d5e6199f42cea4e638875ff8c740757dd3c',
    );
  });

  it('invalid mode is rejected', () => {
    expect(() =>
      loadFeeKeeperConfig(baseEnv({ SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'prod' })),
    ).toThrow(/DEPLOYMENT_MODE/);
  });
});

describe('no holder settlement authority', () => {
  it('fee-keeper source has no publishRound/pushBatch/claim/rootPublisher', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const forbidden = [
      'publishRound',
      'pushBatch',
      'rootPublisher',
      'SCOOP_ROOT_PUBLISHER',
    ];
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const needle of forbidden) {
        expect(text.includes(needle), `${file} must not contain ${needle}`).toBe(
          false,
        );
      }
      // claim as HolderRewards write — allow "claim" only if not a write path; ban claim(
      expect(text.includes('functionName: \'claim\''), `${file} claim write`).toBe(
        false,
      );
      expect(text.includes('functionName: "claim"'), `${file} claim write`).toBe(
        false,
      );
    }
  });
});
