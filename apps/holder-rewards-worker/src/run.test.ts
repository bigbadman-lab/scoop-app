import { describe, expect, it, vi } from 'vitest';
import { zeroAddress } from 'viem';
import { runHolderRewardsWorker } from './run.js';
import type { LoadedHolderRewardsConfig } from './config.js';
import type { HolderRewardsVaultMarket } from '@scoop/db';
import { historicalTestCanaryManifest } from '@scoop/shared';

const cfg = {
  writeEnabled: false,
  mode: 'dry-run' as const,
  chainId: 4663,
  deploymentMode: 'fixture-test' as const,
  factoryAddress:
    historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase() as `0x${string}`,
  poolManagerAddress:
    historicalTestCanaryManifest.contracts.PoolManager.toLowerCase() as `0x${string}`,
  rootPublisherAddress: null,
  rpcUrl: null,
  databaseUrl: 'postgres://x',
  lockDatabaseUrl: 'postgres://x',
  maxRoundsPerRun: 2,
  snapshotConfirmations: 64,
  pushBatchSize: 50,
  expectedPublisherAddress: null,
  publisherPrivateKey: null,
  expectedPushAddress: null,
  pushPrivateKey: null,
} satisfies LoadedHolderRewardsConfig;

const canonicalCfg = {
  ...cfg,
  deploymentMode: 'canonical-production' as const,
  factoryAddress: '0x4b227d5e6199f42cea4e638875ff8c740757dd3c' as const,
  poolManagerAddress: '0x8366a39cc670b4001a1121b8f6a443a643e40951' as const,
  rootPublisherAddress: '0xe37c1c028201054461d0f283896b56552b054b29' as const,
  expectedPublisherAddress: '0xe37c1c028201054461d0f283896b56552b054b29' as const,
  rpcUrl: 'https://example.invalid/rpc',
} satisfies LoadedHolderRewardsConfig;

const market: HolderRewardsVaultMarket = {
  chainId: 4663,
  tokenAddress: '0x2222222222222222222222222222222222222222',
  quoteAsset: zeroAddress,
  holderRewards: '0x1111111111111111111111111111111111111111',
  feeDistributor: '0x3333333333333333333333333333333333333333',
  liquidityLocker: '0x4444444444444444444444444444444444444444',
  additionalFee: 0,
  totalPoolFee: 10_000,
  creatorAllocationDestination: 1,
  additionalFeeDestination: 0,
};

describe('runHolderRewardsWorker', () => {
  it('exits cleanly when lock unavailable and never writes', async () => {
    const result = await runHolderRewardsWorker({
      loadConfig: () => cfg,
      acquireLock: async () => ({ ok: false, reason: 'unavailable' }),
      listVaults: async () => [market],
      createClients: () => null,
    });
    expect(result.exitCode).toBe(0);
    expect(result.writeEnabled).toBe(false);
    expect(result.writesAttempted).toBe(false);
    expect(result.transactionsSent).toBe(0);
    expect(result.launchesDiscovered).toBe(0);
  });

  it('dry-run services vaults without broadcasts', async () => {
    const release = vi.fn(async () => undefined);
    const serviceVaultFn = vi.fn(async () => ({
      roundAssetsConsidered: 1,
      snapshotsReady: 1,
      roundsComputed: 1,
      rootsSimulated: 1,
      rootsPublished: 0,
      pushBatchesSimulated: 1,
      pushBatchesSent: 0,
      leavesPaid: 2,
      leavesFailed: 0,
      roundsSkipped: 0,
      errors: 0,
      writesAttempted: false,
      transactionsSent: 0,
    }));
    const result = await runHolderRewardsWorker({
      loadConfig: () => cfg,
      acquireLock: async () => ({
        ok: true,
        lock: { client: {} as never, release },
      }),
      listVaults: async () => [market],
      createClients: () => null,
      createDb: () => ({ query: async () => ({ rows: [] }) }) as never,
      serviceVaultFn: serviceVaultFn as never,
      nowSec: () => 1_700_000_000,
    });
    expect(release).toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.launchesDiscovered).toBe(1);
    expect(result.rootsSimulated).toBe(1);
    expect(result.writesAttempted).toBe(false);
    expect(serviceVaultFn).toHaveBeenCalled();
    expect(serviceVaultFn.mock.calls[0]?.[0]?.deps?.factoryAddress).toBe(
      cfg.factoryAddress,
    );
  });

  it('canonical mode injects canonical Factory into serviceVault', async () => {
    const release = vi.fn(async () => undefined);
    const serviceVaultFn = vi.fn(async () => ({
      roundAssetsConsidered: 0,
      snapshotsReady: 0,
      roundsComputed: 0,
      rootsSimulated: 0,
      rootsPublished: 0,
      pushBatchesSimulated: 0,
      pushBatchesSent: 0,
      leavesPaid: 0,
      leavesFailed: 0,
      roundsSkipped: 0,
      errors: 0,
      writesAttempted: false,
      transactionsSent: 0,
    }));
    await runHolderRewardsWorker({
      loadConfig: () => canonicalCfg,
      acquireLock: async () => ({
        ok: true,
        lock: { client: {} as never, release },
      }),
      listVaults: async () => [market],
      createClients: () => null,
      createDb: () => ({ query: async () => ({ rows: [] }) }) as never,
      serviceVaultFn: serviceVaultFn as never,
      nowSec: () => 1_700_000_000,
    });
    expect(serviceVaultFn.mock.calls[0]?.[0]?.deps?.factoryAddress).toBe(
      '0x4b227d5e6199f42cea4e638875ff8c740757dd3c',
    );
    expect(serviceVaultFn.mock.calls[0]?.[0]?.deps?.poolManagerAddress).toBe(
      '0x8366a39cc670b4001a1121b8f6a443a643e40951',
    );
    expect(serviceVaultFn.mock.calls[0]?.[0]?.deps?.factoryAddress).not.toBe(
      historicalTestCanaryManifest.contracts.ScoopFactory.toLowerCase(),
    );
  });
});
