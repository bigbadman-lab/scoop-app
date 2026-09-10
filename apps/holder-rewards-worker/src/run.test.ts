import { describe, expect, it, vi } from 'vitest';
import { zeroAddress } from 'viem';
import { runHolderRewardsWorker } from './run.js';
import type { LoadedHolderRewardsConfig } from './config.js';
import type { HolderRewardsVaultMarket } from '@scoop/db';

const cfg = {
  writeEnabled: false,
  mode: 'dry-run' as const,
  chainId: 4663,
  deploymentMode: 'fixture-test' as const,
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
  });
});
