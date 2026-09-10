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
  it('defaults to historical-test with historical Factory', () => {
    const cfg = loadFeeKeeperConfig(baseEnv());
    expect(cfg.deploymentMode).toBe('historical-test');
    expect(cfg.factoryAddress?.toLowerCase()).toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );
    const view = publicConfigView(cfg);
    expect(view.deploymentMode).toBe('historical-test');
    expect(view.factoryAddress).toBe(cfg.factoryAddress);
  });

  it('explicit historical-test is allowed', () => {
    const cfg = loadFeeKeeperConfig(
      baseEnv({ SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'historical-test' }),
    );
    expect(cfg.deploymentMode).toBe('historical-test');
  });

  it('canonical-production while undeployed fails safely (no historical fallback)', () => {
    expect(() =>
      loadFeeKeeperConfig(
        baseEnv({ SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: 'canonical-production' }),
      ),
    ).toThrow(/undeployed/);
    expect(() => resolveDeploymentFactory('canonical-production')).toThrow(
      /refusing to fall back/,
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
