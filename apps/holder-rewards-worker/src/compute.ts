/**
 * Pure round computation: transfers → balances → eligibility → entitlements → merkle.
 * Does not read holder_balances. Does not convert assets.
 */
import { type Address, type Hex, zeroAddress } from 'viem';
import {
  buildHolderRewardMerkleTree,
  classifyHolderEligibility,
  computeHolderEntitlements,
  reconstructBalancesAtSnapshot,
  type EligibilityExclusionReason,
  type HolderRewardMerkleTree,
} from '@scoop/shared';

export type ComputeRoundInput = {
  chainId: number;
  vault: Address;
  token: Address;
  asset: Address;
  roundId: number;
  snapshotBlock: number;
  hourEndUnix: number;
  rewardAmount: bigint;
  transfers: Array<{
    from: string;
    to: string;
    amount: bigint;
    blockNumber: number;
    logIndex: number;
  }>;
  feeDistributor: Address;
  liquidityLocker: Address;
  factory?: Address | null;
  poolManager?: Address | null;
  extraSystemAddresses?: readonly string[];
};

export type ComputedLeaf = {
  account: Address;
  balanceRaw: bigint;
  entitlementRaw: bigint;
  leafHash: Hex;
  leafIndex: number;
  proof: Hex[];
};

export type ComputeRoundResult =
  | {
      ok: true;
      status: 'computed';
      merkleRoot: Hex;
      eligibleSupply: bigint;
      leafCount: number;
      excluded: Array<{ address: string; reason: EligibilityExclusionReason }>;
      leaves: ComputedLeaf[];
      tree: HolderRewardMerkleTree;
      rewardAmount: bigint;
      snapshotBlock: number;
      hourEndUnix: number;
      roundId: number;
      asset: Address;
      vault: Address;
      token: Address;
    }
  | {
      ok: false;
      status: 'skipped_no_reward' | 'skipped_no_holders';
      reason: string;
      rewardAmount: bigint;
      eligibleSupply: bigint;
      excludedCount: number;
    };

export function computeHolderRewardRound(
  input: ComputeRoundInput,
): ComputeRoundResult {
  if (input.rewardAmount <= 0n) {
    return {
      ok: false,
      status: 'skipped_no_reward',
      reason: 'uncommitted reward amount is zero',
      rewardAmount: input.rewardAmount,
      eligibleSupply: 0n,
      excludedCount: 0,
    };
  }

  const balances = reconstructBalancesAtSnapshot(
    input.transfers,
    input.snapshotBlock,
  );

  const excluded: Array<{ address: string; reason: EligibilityExclusionReason }> =
    [];
  const eligible: Array<{ address: string; balanceRaw: bigint }> = [];

  for (const [address, balanceRaw] of balances) {
    const result = classifyHolderEligibility({
      address,
      balanceRaw,
      launchToken: input.token,
      holderRewardsVault: input.vault,
      feeDistributor: input.feeDistributor,
      liquidityLocker: input.liquidityLocker,
      factory: input.factory,
      poolManager: input.poolManager,
      extraSystemAddresses: input.extraSystemAddresses,
    });
    if (result.eligible) {
      eligible.push({ address: result.address, balanceRaw: result.balanceRaw });
    } else {
      excluded.push({ address: result.address, reason: result.reason });
    }
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      status: 'skipped_no_holders',
      reason: 'no_eligible_holders',
      rewardAmount: input.rewardAmount,
      eligibleSupply: 0n,
      excludedCount: excluded.length,
    };
  }

  const { entitlements, eligibleSupply } = computeHolderEntitlements({
    rewardAmount: input.rewardAmount,
    holders: eligible,
  });

  if (entitlements.length === 0 || eligibleSupply <= 0n) {
    return {
      ok: false,
      status: 'skipped_no_holders',
      reason: 'no_eligible_holders',
      rewardAmount: input.rewardAmount,
      eligibleSupply,
      excludedCount: excluded.length,
    };
  }

  const tree = buildHolderRewardMerkleTree({
    chainId: input.chainId,
    vault: input.vault,
    roundId: BigInt(input.roundId),
    asset: input.asset,
    entitlements: entitlements.map((e) => ({
      account: e.account as Address,
      amount: e.entitlementRaw,
    })),
  });

  const leaves: ComputedLeaf[] = entitlements.map((e, leafIndex) => ({
    account: e.account as Address,
    balanceRaw: e.balanceRaw,
    entitlementRaw: e.entitlementRaw,
    leafHash: tree.leaves[leafIndex]!,
    leafIndex,
    proof: tree.getProof(e.account),
  }));

  return {
    ok: true,
    status: 'computed',
    merkleRoot: tree.root,
    eligibleSupply,
    leafCount: leaves.length,
    excluded,
    leaves,
    tree,
    rewardAmount: input.rewardAmount,
    snapshotBlock: input.snapshotBlock,
    hourEndUnix: input.hourEndUnix,
    roundId: input.roundId,
    asset: input.asset,
    vault: input.vault,
    token: input.token,
  };
}

/** Assert reward asset identity is preserved (no swap helpers). */
export function assertAssetIdentityPreserved(
  discoveredAsset: string,
  committedAsset: string,
): void {
  if (discoveredAsset.toLowerCase() !== committedAsset.toLowerCase()) {
    throw new Error(
      `asset identity mismatch: discovered=${discoveredAsset} committed=${committedAsset}`,
    );
  }
  // Explicitly refuse treating non-ETH as ETH
  if (
    committedAsset.toLowerCase() !== zeroAddress &&
    discoveredAsset.toLowerCase() === zeroAddress
  ) {
    throw new Error('refusing to convert non-ETH reward to ETH');
  }
}
