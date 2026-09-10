import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  upsertHolderRewardDeposit,
  upsertHolderRewardRound,
  upsertHolderRewardPayout,
  upsertAddressClassification,
} = vi.hoisted(() => ({
  upsertHolderRewardDeposit: vi.fn(async () => undefined),
  upsertHolderRewardRound: vi.fn(async () => undefined),
  upsertHolderRewardPayout: vi.fn(async () => ({ inserted: true })),
  upsertAddressClassification: vi.fn(async () => undefined),
}));

vi.mock('@scoop/db', () => ({
  upsertHolderRewardDeposit,
  upsertHolderRewardRound,
  upsertHolderRewardPayout,
  upsertAddressClassification,
}));

import { processHolderRewardEvents } from './holderRewards.js';
import type { Watchlist, WatchlistEntry } from '../watchlist.js';

function entry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    chainId: 4663,
    tokenAddress: '0x2222222222222222222222222222222222222222',
    poolId: `0x${'ab'.repeat(32)}`,
    feeDistributorAddress: '0x3333333333333333333333333333333333333333',
    liquidityLockerAddress: '0x4444444444444444444444444444444444444444',
    holderRewardsAddress: '0x5555555555555555555555555555555555555555',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    factoryAddress: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
    deployerAddress: '0x6666666666666666666666666666666666666666',
    creatorId: `0x${'cd'.repeat(32)}`,
    tickLower: -887270,
    tickUpper: 200260,
    openingSqrtPriceX96: '1',
    lpTokenId: '1',
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0x2222222222222222222222222222222222222222',
    fee: 20000,
    tickSpacing: 10,
    hooks: '0x0000000000000000000000000000000000000000',
    tokenIsCurrency1: true,
    tokenDecimals: 18,
    quoteDecimals: 18,
    ...overrides,
  };
}

describe('processHolderRewardEvents', () => {
  const vault = '0x5555555555555555555555555555555555555555';
  const asset = '0x0000000000000000000000000000000000000000';
  const account = '0x7777777777777777777777777777777777777777';

  beforeEach(() => {
    upsertHolderRewardDeposit.mockReset();
    upsertHolderRewardRound.mockReset();
    upsertHolderRewardPayout.mockReset();
    upsertAddressClassification.mockReset();
  });

  function watchlist(): Watchlist {
    const e = entry();
    return {
      tokens: new Map([[e.tokenAddress, e]]),
      pools: new Map([[e.poolId, e]]),
      distributors: new Map([[e.feeDistributorAddress, e]]),
      holderVaults: new Map([[vault, e]]),
      lockers: new Set([e.liquidityLockerAddress]),
      tokenAddresses: [e.tokenAddress],
      distributorAddresses: [e.feeDistributorAddress],
      holderVaultAddresses: [vault],
    };
  }

  it('projects deposit, round, push, claim; failed push is failed status', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    const wl = watchlist();
    const common = {
      chainId: 4663,
      blockNumber: 10n,
      blockHash: `0x${'11'.repeat(32)}`,
      blockTimestamp: 100n,
      txHash: `0x${'22'.repeat(32)}`,
      watchlist: wl,
    };

    await processHolderRewardEvents(db as never, {
      ...common,
      events: [
        {
          kind: 'HolderRewardDeposited',
          address: vault,
          logIndex: 1,
          args: { asset, amount: 500n },
        },
      ],
    });
    expect(upsertHolderRewardDeposit).toHaveBeenCalledOnce();
    expect(upsertHolderRewardDeposit.mock.calls[0]![1].amountRaw).toBe(500n);

    await processHolderRewardEvents(db as never, {
      ...common,
      events: [
        {
          kind: 'HolderRewardRoundPublished',
          address: vault,
          logIndex: 2,
          args: {
            roundId: 1n,
            asset,
            merkleRoot: `0x${'33'.repeat(32)}`,
            totalCommitted: 500n,
          },
        },
      ],
    });
    expect(upsertHolderRewardRound).toHaveBeenCalledOnce();
    expect(upsertHolderRewardRound.mock.calls[0]![1].totalCommittedRaw).toBe(500n);

    await processHolderRewardEvents(db as never, {
      ...common,
      events: [
        {
          kind: 'HolderRewardPushed',
          address: vault,
          logIndex: 3,
          args: { roundId: 1n, asset, account, amount: 200n },
        },
      ],
    });
    expect(upsertHolderRewardPayout.mock.calls.at(-1)![1]).toMatchObject({
      payoutType: 'push',
      status: 'paid',
      amountRaw: 200n,
    });

    await processHolderRewardEvents(db as never, {
      ...common,
      events: [
        {
          kind: 'HolderRewardClaimed',
          address: vault,
          logIndex: 4,
          args: { roundId: 1n, asset, account: '0x8888888888888888888888888888888888888888', amount: 100n },
        },
      ],
    });
    expect(upsertHolderRewardPayout.mock.calls.at(-1)![1]).toMatchObject({
      payoutType: 'claim',
      status: 'paid',
    });

    await processHolderRewardEvents(db as never, {
      ...common,
      events: [
        {
          kind: 'HolderRewardPushFailed',
          address: vault,
          logIndex: 5,
          args: {
            roundId: 1n,
            asset,
            account: '0x9999999999999999999999999999999999999999',
            amount: 50n,
            reason: '0x08c379a0',
          },
        },
      ],
    });
    expect(upsertHolderRewardPayout.mock.calls.at(-1)![1]).toMatchObject({
      payoutType: 'push',
      status: 'failed',
      amountRaw: 50n,
    });
  });

  it('ignores events from unknown vaults', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    await processHolderRewardEvents(db as never, {
      chainId: 4663,
      blockNumber: 1n,
      blockHash: `0x${'11'.repeat(32)}`,
      blockTimestamp: 1n,
      txHash: `0x${'22'.repeat(32)}`,
      watchlist: watchlist(),
      events: [
        {
          kind: 'HolderRewardDeposited',
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          logIndex: 1,
          args: { asset, amount: 1n },
        },
      ],
    });
    expect(upsertHolderRewardDeposit).not.toHaveBeenCalled();
  });
});
