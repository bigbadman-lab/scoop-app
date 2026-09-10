import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { loadHolderRewardsConfig, publicConfigView } from './config.js';

const PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const ADDR = privateKeyToAccount(PK).address.toLowerCase();
const FEE_PK =
  '0x2222222222222222222222222222222222222222222222222222222222222222' as const;

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ...overrides,
  };
}

describe('holder rewards config', () => {
  it('defaults to dry-run fixture-test', () => {
    const cfg = loadHolderRewardsConfig(baseEnv());
    expect(cfg.writeEnabled).toBe(false);
    expect(cfg.mode).toBe('dry-run');
    expect(cfg.deploymentMode).toBe('fixture-test');
    expect(cfg.pushBatchSize).toBe(50);
    expect(cfg.snapshotConfirmations).toBe(64);
    expect(publicConfigView(cfg).publisherAddress).toBeNull();
  });

  it('canonical-production while undeployed fails safely', () => {
    expect(() =>
      loadHolderRewardsConfig(
        baseEnv({ SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE: 'canonical-production' }),
      ),
    ).toThrow(/undeployed/);
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
