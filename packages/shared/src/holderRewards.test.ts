import { describe, expect, it } from 'vitest';
import { type Address, zeroAddress } from 'viem';
import {
  buildHolderRewardMerkleTree,
  holderRewardLeafHash,
  verifyMerkleProof,
} from './holderRewardsMerkle.js';
import {
  classifyHolderEligibility,
  computeHolderEntitlements,
  hourEndUnixFromRoundId,
  latestCompletableRoundId,
  reconstructBalancesAtSnapshot,
  roundIdFromUnix,
} from './holderRewardsEconomics.js';

const VAULT = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const DIST = '0x3333333333333333333333333333333333333333' as Address;
const LOCKER = '0x4444444444444444444444444444444444444444' as Address;
const FACTORY = '0x5555555555555555555555555555555555555555' as Address;
const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const DEAD = '0x000000000000000000000000000000000000dead';

describe('holder reward merkle (OZ commutative)', () => {
  it('single leaf root equals leaf; empty proof verifies', () => {
    const amount = 3n * 10n ** 18n;
    const tree = buildHolderRewardMerkleTree({
      chainId: 4663,
      vault: VAULT,
      roundId: 1n,
      asset: zeroAddress,
      entitlements: [{ account: ALICE, amount }],
    });
    const leaf = holderRewardLeafHash({
      chainId: 4663,
      vault: VAULT,
      roundId: 1n,
      asset: zeroAddress,
      account: ALICE,
      amount,
    });
    expect(tree.root).toBe(leaf);
    expect(tree.getProof(ALICE)).toEqual([]);
    expect(tree.verify(ALICE, amount, [])).toBe(true);
    expect(verifyMerkleProof([], tree.root, leaf)).toBe(true);
  });

  it('two-leaf tree verifies both proofs and is order-independent for accounts sorted', () => {
    const tree = buildHolderRewardMerkleTree({
      chainId: 4663,
      vault: VAULT,
      roundId: 5n,
      asset: zeroAddress,
      entitlements: [
        { account: BOB, amount: 4n * 10n ** 18n },
        { account: ALICE, amount: 3n * 10n ** 18n },
      ],
    });
    expect(tree.accounts[0]).toBe(ALICE.toLowerCase());
    expect(tree.verify(ALICE, 3n * 10n ** 18n, tree.getProof(ALICE))).toBe(true);
    expect(tree.verify(BOB, 4n * 10n ** 18n, tree.getProof(BOB))).toBe(true);
    expect(tree.verify(ALICE, 4n * 10n ** 18n, tree.getProof(ALICE))).toBe(false);
  });

  it('deterministic root for same inputs', () => {
    const build = () =>
      buildHolderRewardMerkleTree({
        chainId: 4663,
        vault: VAULT,
        roundId: 10n,
        asset: TOKEN,
        entitlements: [
          { account: BOB, amount: 100n },
          { account: ALICE, amount: 50n },
        ],
      }).root;
    expect(build()).toBe(build());
  });

  it('wrong chain/vault/round/asset/account/amount fail verification', () => {
    const tree = buildHolderRewardMerkleTree({
      chainId: 4663,
      vault: VAULT,
      roundId: 7n,
      asset: zeroAddress,
      entitlements: [{ account: ALICE, amount: 9n }],
    });
    const proof = tree.getProof(ALICE);
    expect(tree.verify(ALICE, 9n, proof)).toBe(true);
    expect(
      verifyMerkleProof(
        proof,
        tree.root,
        holderRewardLeafHash({
          chainId: 1,
          vault: VAULT,
          roundId: 7n,
          asset: zeroAddress,
          account: ALICE,
          amount: 9n,
        }),
      ),
    ).toBe(false);
    expect(
      verifyMerkleProof(
        proof,
        tree.root,
        holderRewardLeafHash({
          chainId: 4663,
          vault: TOKEN,
          roundId: 7n,
          asset: zeroAddress,
          account: ALICE,
          amount: 9n,
        }),
      ),
    ).toBe(false);
    expect(
      verifyMerkleProof(
        proof,
        tree.root,
        holderRewardLeafHash({
          chainId: 4663,
          vault: VAULT,
          roundId: 8n,
          asset: zeroAddress,
          account: ALICE,
          amount: 9n,
        }),
      ),
    ).toBe(false);
    expect(
      verifyMerkleProof(
        proof,
        tree.root,
        holderRewardLeafHash({
          chainId: 4663,
          vault: VAULT,
          roundId: 7n,
          asset: TOKEN,
          account: ALICE,
          amount: 9n,
        }),
      ),
    ).toBe(false);
    expect(tree.verify(BOB, 9n, proof)).toBe(false);
    expect(tree.verify(ALICE, 8n, proof)).toBe(false);
  });
});

describe('entitlements + eligibility', () => {
  it('sum(entitlements) == rewardAmount with remainder distribution', () => {
    const { entitlements, eligibleSupply } = computeHolderEntitlements({
      rewardAmount: 100n,
      holders: [
        { address: ALICE, balanceRaw: 30n },
        { address: BOB, balanceRaw: 70n },
      ],
    });
    expect(eligibleSupply).toBe(100n);
    let sum = 0n;
    for (const e of entitlements) sum += e.entitlementRaw;
    expect(sum).toBe(100n);
  });

  it('single holder gets 100%; 1 wei dust; reward < holders', () => {
    expect(
      computeHolderEntitlements({
        rewardAmount: 42n,
        holders: [{ address: ALICE, balanceRaw: 1n }],
      }).entitlements[0]!.entitlementRaw,
    ).toBe(42n);

    const oneWei = computeHolderEntitlements({
      rewardAmount: 1n,
      holders: [
        { address: ALICE, balanceRaw: 1n },
        { address: BOB, balanceRaw: 1n },
      ],
    });
    expect(oneWei.entitlements).toHaveLength(1);
    expect(oneWei.entitlements[0]!.entitlementRaw).toBe(1n);

    const tiny = computeHolderEntitlements({
      rewardAmount: 2n,
      holders: [
        { address: ALICE, balanceRaw: 10n },
        { address: BOB, balanceRaw: 10n },
        { address: '0xcccccccccccccccccccccccccccccccccccccccc', balanceRaw: 10n },
      ],
    });
    let sum = 0n;
    for (const e of tiny.entitlements) sum += e.entitlementRaw;
    expect(sum).toBe(2n);
  });

  it('large bigint conservation', () => {
    const reward = 10n ** 30n + 7n;
    const { entitlements } = computeHolderEntitlements({
      rewardAmount: reward,
      holders: [
        { address: ALICE, balanceRaw: 10n ** 18n },
        { address: BOB, balanceRaw: 3n * 10n ** 18n },
      ],
    });
    let sum = 0n;
    for (const e of entitlements) sum += e.entitlementRaw;
    expect(sum).toBe(reward);
  });

  it('excludes system addresses; deployer/creator wallets remain eligible', () => {
    const deployer = '0xdddddddddddddddddddddddddddddddddddddddd';
    const creator = '0xcccccccccccccccccccccccccccccccccccccccc';
    const base = {
      balanceRaw: 1n,
      launchToken: TOKEN,
      holderRewardsVault: VAULT,
      feeDistributor: DIST,
      liquidityLocker: LOCKER,
      factory: FACTORY,
    };
    expect(classifyHolderEligibility({ ...base, address: deployer }).eligible).toBe(
      true,
    );
    expect(classifyHolderEligibility({ ...base, address: creator }).eligible).toBe(
      true,
    );
    expect(classifyHolderEligibility({ ...base, address: VAULT }).eligible).toBe(
      false,
    );
    expect(classifyHolderEligibility({ ...base, address: DIST }).eligible).toBe(
      false,
    );
    expect(classifyHolderEligibility({ ...base, address: LOCKER }).eligible).toBe(
      false,
    );
    expect(classifyHolderEligibility({ ...base, address: TOKEN }).eligible).toBe(
      false,
    );
    expect(classifyHolderEligibility({ ...base, address: FACTORY }).eligible).toBe(
      false,
    );
    expect(
      classifyHolderEligibility({ ...base, address: zeroAddress }).eligible,
    ).toBe(false);
    expect(classifyHolderEligibility({ ...base, address: DEAD }).eligible).toBe(
      false,
    );
    expect(
      classifyHolderEligibility({ ...base, address: ALICE, balanceRaw: 0n })
        .eligible,
    ).toBe(false);
  });

  it('round id helpers', () => {
    expect(roundIdFromUnix(3600)).toBe(1);
    expect(hourEndUnixFromRoundId(1)).toBe(7200);
    expect(latestCompletableRoundId(7200)).toBe(1);
    expect(latestCompletableRoundId(7199)).toBe(0);
  });

  it('reconstructs balances from transfers; fails on negative', () => {
    const balances = reconstructBalancesAtSnapshot(
      [
        {
          from: zeroAddress,
          to: ALICE,
          amount: 100n,
          blockNumber: 1,
          logIndex: 0,
        },
        {
          from: ALICE,
          to: BOB,
          amount: 40n,
          blockNumber: 2,
          logIndex: 1,
        },
        {
          from: ALICE,
          to: zeroAddress,
          amount: 10n,
          blockNumber: 2,
          logIndex: 2,
        },
        {
          from: BOB,
          to: ALICE,
          amount: 5n,
          blockNumber: 3,
          logIndex: 0,
        },
      ],
      2,
    );
    expect(balances.get(ALICE.toLowerCase())).toBe(50n);
    expect(balances.get(BOB.toLowerCase())).toBe(40n);
    expect(() =>
      reconstructBalancesAtSnapshot(
        [
          {
            from: ALICE,
            to: BOB,
            amount: 1n,
            blockNumber: 1,
            logIndex: 0,
          },
        ],
        1,
      ),
    ).toThrow(/negative balance/);
  });

  it('same-block ordering by log_index; case normalization; full transfer', () => {
    const balances = reconstructBalancesAtSnapshot(
      [
        {
          from: zeroAddress,
          to: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
          amount: 10n,
          blockNumber: 1,
          logIndex: 0,
        },
        {
          from: ALICE,
          to: BOB,
          amount: 10n,
          blockNumber: 1,
          logIndex: 1,
        },
      ],
      1,
    );
    expect(balances.has(ALICE.toLowerCase())).toBe(false);
    expect(balances.get(BOB.toLowerCase())).toBe(10n);
  });

  it('asset identities remain unchanged (no conversion)', () => {
    const eth = zeroAddress;
    const amzn = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
    const usdg = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
    for (const asset of [eth, amzn, usdg, TOKEN]) {
      const tree = buildHolderRewardMerkleTree({
        chainId: 4663,
        vault: VAULT,
        roundId: 1n,
        asset,
        entitlements: [{ account: ALICE, amount: 1n }],
      });
      expect(tree.verify(ALICE, 1n, [])).toBe(true);
    }
  });
});
