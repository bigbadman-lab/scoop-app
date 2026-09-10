import { describe, expect, it } from 'vitest';
import { type Address, zeroAddress } from 'viem';
import {
  buildHolderRewardMerkleTree,
  holderRewardLeafHash,
} from '@scoop/shared';
import {
  assertAssetIdentityPreserved,
  computeHolderRewardRound,
} from './compute.js';
import { planPushBatches } from './push.js';
import { simulatePublishOffline } from './publish.js';

const VAULT = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const DIST = '0x3333333333333333333333333333333333333333' as Address;
const LOCKER = '0x4444444444444444444444444444444444444444' as Address;
const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;

/** Cross-checked ABI leaf vectors (OZ double-hash + commutative root). */
const FIXTURE = {
  aliceLeaf:
    '0x0424a9907cf41af1dee615322b4e624ea8a01e20ce5f33ebc7ce482e971681d2',
  bobLeaf:
    '0xf15d2d16ca6291cc09b17bbd7257def62023b5488ac7a8e605e63ffb0dea8753',
  twoLeafRoot:
    '0xf48142b48607ff0ac1c58cd41b647238590226760408c509fb1e1db0551a15f5',
} as const;

describe('OZ / Solidity merkle fixture vectors', () => {
  it('matches checked-in leaf and two-leaf commutative root', () => {
    const aliceLeaf = holderRewardLeafHash({
      chainId: 4663,
      vault: VAULT,
      roundId: 1n,
      asset: zeroAddress,
      account: ALICE,
      amount: 3n * 10n ** 18n,
    });
    const bobLeaf = holderRewardLeafHash({
      chainId: 4663,
      vault: VAULT,
      roundId: 1n,
      asset: zeroAddress,
      account: BOB,
      amount: 4n * 10n ** 18n,
    });
    expect(aliceLeaf).toBe(FIXTURE.aliceLeaf);
    expect(bobLeaf).toBe(FIXTURE.bobLeaf);
    const tree = buildHolderRewardMerkleTree({
      chainId: 4663,
      vault: VAULT,
      roundId: 1n,
      asset: zeroAddress,
      entitlements: [
        { account: ALICE, amount: 3n * 10n ** 18n },
        { account: BOB, amount: 4n * 10n ** 18n },
      ],
    });
    expect(tree.root).toBe(FIXTURE.twoLeafRoot);
    expect(tree.verify(ALICE, 3n * 10n ** 18n, tree.getProof(ALICE))).toBe(true);
    expect(tree.verify(BOB, 4n * 10n ** 18n, tree.getProof(BOB))).toBe(true);
  });
});

describe('end-to-end deterministic fixture', () => {
  const transfers = [
    {
      from: zeroAddress,
      to: ALICE,
      amount: 60n,
      blockNumber: 10,
      logIndex: 0,
    },
    {
      from: zeroAddress,
      to: BOB,
      amount: 40n,
      blockNumber: 10,
      logIndex: 1,
    },
    {
      from: ALICE,
      to: CAROL,
      amount: 10n,
      blockNumber: 11,
      logIndex: 0,
    },
    // After snapshot — must be ignored
    {
      from: BOB,
      to: ALICE,
      amount: 5n,
      blockNumber: 20,
      logIndex: 0,
    },
  ];

  it('computes entitlements + root for ETH reward from launch-token snapshot', () => {
    const eth = computeHolderRewardRound({
      chainId: 4663,
      vault: VAULT,
      token: TOKEN,
      asset: zeroAddress,
      roundId: 100,
      snapshotBlock: 11,
      hourEndUnix: 101 * 3600,
      rewardAmount: 100n,
      transfers,
      feeDistributor: DIST,
      liquidityLocker: LOCKER,
    });
    expect(eth.ok).toBe(true);
    if (!eth.ok) return;
    let sum = 0n;
    for (const leaf of eth.leaves) sum += leaf.entitlementRaw;
    expect(sum).toBe(100n);
    // Alice 50, Bob 40, Carol 10 at snapshot 11
    expect(eth.eligibleSupply).toBe(100n);
    expect(eth.leafCount).toBe(3);
    expect(eth.tree.verify(ALICE, eth.leaves.find((l) => l.account === ALICE.toLowerCase())!.entitlementRaw, eth.tree.getProof(ALICE))).toBe(true);

    const tokenReward = computeHolderRewardRound({
      chainId: 4663,
      vault: VAULT,
      token: TOKEN,
      asset: TOKEN,
      roundId: 100,
      snapshotBlock: 11,
      hourEndUnix: 101 * 3600,
      rewardAmount: 50n,
      transfers,
      feeDistributor: DIST,
      liquidityLocker: LOCKER,
    });
    expect(tokenReward.ok).toBe(true);
    if (!tokenReward.ok) return;
    // Same holders/snapshot, different asset → different root
    expect(tokenReward.merkleRoot).not.toBe(eth.merkleRoot);

    const pub = simulatePublishOffline({
      merkleRoot: eth.merkleRoot,
      totalCommitted: eth.rewardAmount,
    });
    expect(pub.ok).toBe(true);
    if (pub.ok) expect(pub.mode).toBe('simulated');

    const batches = planPushBatches(eth.leaves, 2);
    expect(batches.length).toBe(2);
    expect(batches[0]!.length).toBe(2);
    expect(batches[1]!.length).toBe(1);
  });

  it('preserves asset identity (no conversion)', () => {
    expect(() =>
      assertAssetIdentityPreserved(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        zeroAddress,
      ),
    ).toThrow(/mismatch|convert/i);
  });

  it('excludes vault/distributor from eligibility in pipeline', () => {
    const result = computeHolderRewardRound({
      chainId: 4663,
      vault: VAULT,
      token: TOKEN,
      asset: zeroAddress,
      roundId: 1,
      snapshotBlock: 1,
      hourEndUnix: 7200,
      rewardAmount: 10n,
      transfers: [
        {
          from: zeroAddress,
          to: VAULT,
          amount: 100n,
          blockNumber: 1,
          logIndex: 0,
        },
        {
          from: zeroAddress,
          to: ALICE,
          amount: 1n,
          blockNumber: 1,
          logIndex: 1,
        },
      ],
      feeDistributor: DIST,
      liquidityLocker: LOCKER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(1);
    expect(result.leaves[0]!.account).toBe(ALICE.toLowerCase());
  });
});

describe('performance sanity', () => {
  it('builds entitlements + merkle for 1000 holders under 5s', () => {
    const holders = Array.from({ length: 1000 }, (_, i) => {
      const hex = (i + 1).toString(16).padStart(40, '0');
      return {
        from: zeroAddress,
        to: `0x${hex}` as Address,
        amount: BigInt(i + 1),
        blockNumber: 1,
        logIndex: i,
      };
    });
    const started = Date.now();
    const result = computeHolderRewardRound({
      chainId: 4663,
      vault: VAULT,
      token: TOKEN,
      asset: zeroAddress,
      roundId: 1,
      snapshotBlock: 1,
      hourEndUnix: 7200,
      rewardAmount: 1_000_000n,
      transfers: holders,
      feeDistributor: DIST,
      liquidityLocker: LOCKER,
    });
    const ms = Date.now() - started;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.leafCount).toBe(1000);
      for (const leaf of result.leaves.slice(0, 5)) {
        expect(
          result.tree.verify(leaf.account, leaf.entitlementRaw, leaf.proof),
        ).toBe(true);
      }
    }
    // Correctness-first; O(n log n) proofs should finish well under this budget.
    expect(ms).toBeLessThan(5000);
  });
});
