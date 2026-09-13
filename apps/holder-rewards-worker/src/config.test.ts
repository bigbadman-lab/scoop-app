import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  loadHolderRewardsConfig,
  publicConfigView,
  resolveDeploymentAddresses,
} from './config.js';
import { historicalTestCanaryManifest } from '@scoop/shared';

const PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const ADDR = privateKeyToAccount(PK).address.toLowerCase();
const FEE_PK =
  '0x2222222222222222222222222222222222222222222222222222222222222222' as const;
const CANONICAL_FACTORY = '0x4b227d5e6199f42cea4e638875ff8c740757dd3c';
const CANONICAL_ROOT_PUBLISHER =
  '0xe37c1c028201054461d0f283896b56552b054b29';
const CANONICAL_POOL_MANAGER =
  '0x8366a39cc670b4001a1121b8f6a443a643e40951';

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ...overrides,
  };
}

describe('holder rewards config', () => {
  it('defaults to dry-run fixture-test with historical Factory', () => {
    const cfg = loadHolderRewardsConfig(baseEnv());
    expect(cfg.writeEnabled).toBe(false);
    expect(cfg.mode).toBe('dry-run');
    expect(cfg.deploymentMode).toBe('fixture-test');
    expect(cfg.factoryAddress).toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );
    expect(cfg.poolManagerAddress).toBe(
      historicalTestCanaryManifest.contracts.PoolManager.toLowerCase(),
    );
    expect(cfg.rootPublisherAddress).toBeNull();
    expect(cfg.pushBatchSize).toBe(50);
    expect(cfg.snapshotConfirmations).toBe(64);
    expect(publicConfigView(cfg).publisherAddress).toBeNull();
  });

  it('canonical-production resolves P10.3 Factory / PoolManager / RootPublisher', () => {
    const resolved = resolveDeploymentAddresses('canonical-production');
    expect(resolved.factoryAddress).toBe(CANONICAL_FACTORY);
    expect(resolved.poolManagerAddress).toBe(CANONICAL_POOL_MANAGER);
    expect(resolved.rootPublisherAddress).toBe(CANONICAL_ROOT_PUBLISHER);
    expect(resolved.factoryAddress).not.toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );

    const cfg = loadHolderRewardsConfig(
      baseEnv({
        SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE: 'canonical-production',
        ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
        DATABASE_URL: 'postgres://localhost/scoop',
      }),
    );
    expect(cfg.deploymentMode).toBe('canonical-production');
    expect(cfg.factoryAddress).toBe(CANONICAL_FACTORY);
    expect(cfg.poolManagerAddress).toBe(CANONICAL_POOL_MANAGER);
    expect(cfg.rootPublisherAddress).toBe(CANONICAL_ROOT_PUBLISHER);
    expect(cfg.expectedPublisherAddress).toBe(CANONICAL_ROOT_PUBLISHER);
  });

  it('canonical-production refuses mismatched publisher address', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({
          SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE: 'canonical-production',
          ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
          DATABASE_URL: 'postgres://localhost/scoop',
          SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS:
            '0x0000000000000000000000000000000000000001',
        }),
      ),
    ).toThrow(/must match canonical RootPublisher/);
  });

  it('write mode requires publisher key (fail-closed)', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({
          SCOOP_HOLDER_REWARDS_WRITE_ENABLED: 'true',
          SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE: 'canonical-production',
          ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
          DATABASE_URL: 'postgres://localhost/scoop',
        }),
      ),
    ).toThrow(/PUBLISHER_PRIVATE_KEY/);
  });

  it('refuses fee-keeper key reuse as publisher', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({
          SCOOP_HOLDER_REWARDS_WRITE_ENABLED: 'true',
          SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY: PK,
          SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS: ADDR,
          SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
          ROBINHOOD_RPC_URL: 'https://example.invalid',
          DATABASE_URL: 'postgres://x',
        }),
      ),
    ).toThrow(/must not reuse SCOOP_FEE_KEEPER_PRIVATE_KEY/);
  });

  it('pins publisher address to derived signer', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({
          SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY: PK,
          SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS:
            '0x0000000000000000000000000000000000000001',
        }),
      ),
    ).toThrow(/does not match/);
  });

  it('accepts matching publisher pin without retaining key in dry-run', () => {
    const cfg = loadHolderRewardsConfig(
      baseEnv({
        SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY: PK,
        SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS: ADDR,
        SCOOP_FEE_KEEPER_PRIVATE_KEY: FEE_PK,
      }),
    );
    expect(cfg.expectedPublisherAddress).toBe(ADDR);
    expect(cfg.publisherPrivateKey).toBeNull();
  });

  it('hard-caps push batch size at 100', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({ SCOOP_HOLDER_REWARDS_PUSH_BATCH_SIZE: '101' }),
      ),
    ).toThrow(/hard cap/);
  });
});
