import { describe, expect, it, vi } from 'vitest';
import { upsertFeeDistribution, upsertLaunch } from '../index.js';

describe('P5 DB upsert SQL surfaces', () => {
  it('upsertLaunch includes economics columns with COALESCE', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await upsertLaunch({ query } as never, {
      chainId: 4663,
      tokenAddress: '0x2222222222222222222222222222222222222222',
      factoryAddress: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
      deployerAddress: '0x1111111111111111111111111111111111111111',
      creatorId: `0x${'ab'.repeat(32)}`,
      quoteAsset: '0x0000000000000000000000000000000000000000',
      feeDistributorAddress: '0x3333333333333333333333333333333333333333',
      liquidityLockerAddress: '0x4444444444444444444444444444444444444444',
      poolId: `0x${'cd'.repeat(32)}`,
      lpTokenId: 1,
      openingSqrtPriceX96: 1n,
      openingTick: 1,
      tickLower: -10,
      tickUpper: 10,
      launchTxHash: `0x${'ef'.repeat(32)}`,
      launchBlock: 1,
      launchLogIndex: 0,
      launchedAt: 1,
      launchFeeRaw: 1n,
      initialBuyPresent: false,
      additionalFee: 10000,
      totalPoolFee: 20000,
      creatorAllocationDestination: 1,
      additionalFeeDestination: 2,
      holderRewardsAddress: '0x5555555555555555555555555555555555555555',
    });
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toMatch(/additional_fee/);
    expect(sql).toMatch(/total_pool_fee/);
    expect(sql).toMatch(/holder_rewards_address/);
    expect(sql).toMatch(/COALESCE\(\s*EXCLUDED\.holder_rewards_address/s);
    expect(query.mock.calls[0]![1]).toEqual(
      expect.arrayContaining([10000, 20000, 1, 2]),
    );
  });

  it('upsertFeeDistribution writes base/extra legs', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await upsertFeeDistribution({ query } as never, {
      chainId: 4663,
      feeDistributorAddress: '0x3333333333333333333333333333333333333333',
      scoopTokenAddress: '0x2222222222222222222222222222222222222222',
      assetKind: 'eth',
      assetAddress: '0x0000000000000000000000000000000000000000',
      txHash: `0x${'11'.repeat(32)}`,
      logIndex: 1,
      blockNumber: 1,
      blockHash: `0x${'22'.repeat(32)}`,
      blockTimestamp: 1,
      totalRaw: 3000n,
      creatorRaw: 1400n,
      deployerRaw: 1080n,
      buybackRaw: 400n,
      operationsRaw: 120n,
      baseCreatorRaw: 1400n,
      baseHoldersRaw: 0n,
      baseDeployerRaw: 80n,
      baseProtocolRaw: 400n,
      baseOperationsRaw: 120n,
      extraCreatorRaw: 0n,
      extraDeployerRaw: 1000n,
      extraHoldersRaw: 0n,
      holdersRaw: 0n,
    });
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toMatch(/base_creator_raw/);
    expect(sql).toMatch(/extra_deployer_raw/);
    expect(sql).toMatch(/holders_raw/);
  });
});
