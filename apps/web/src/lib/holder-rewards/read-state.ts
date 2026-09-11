import type { Address, Hex, PublicClient } from 'viem';
import { isAddress } from 'viem';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { scoopHolderRewardsAbi } from './abi';
import type { HolderRewardEntitlementDto, HolderRewardOnChainRound } from './types';
import {
  deriveHolderRewardUiState,
  verifyEntitlementProofAgainstRoot,
  type EntitlementProofCheckResult,
} from './derive-state';
import type { HolderRewardDurableState } from './types';

export type HolderRewardEnrichedRow = {
  entitlement: HolderRewardEntitlementDto;
  durableState: HolderRewardDurableState;
  reason: string | null;
  isPaid: boolean;
  round: HolderRewardOnChainRound | null;
  proofCheck: EntitlementProofCheckResult | null;
};

export async function readHolderRewardRound(args: {
  publicClient: PublicClient;
  vault: Address;
  roundId: bigint;
  asset: Address;
}): Promise<HolderRewardOnChainRound> {
  const [merkleRoot, totalCommitted, published] = (await args.publicClient.readContract({
    address: args.vault,
    abi: scoopHolderRewardsAbi,
    functionName: 'round',
    args: [args.roundId, args.asset],
  })) as [Hex, bigint, boolean];
  return {
    merkleRoot: merkleRoot.toLowerCase() as Hex,
    totalCommitted,
    published,
  };
}

export async function readHolderRewardIsPaid(args: {
  publicClient: PublicClient;
  vault: Address;
  roundId: bigint;
  asset: Address;
  account: Address;
}): Promise<boolean> {
  return args.publicClient.readContract({
    address: args.vault,
    abi: scoopHolderRewardsAbi,
    functionName: 'isPaid',
    args: [args.roundId, args.asset, args.account],
  }) as Promise<boolean>;
}

/**
 * Enrich discovery entitlements with authoritative on-chain round + isPaid.
 * Worker DB status is discovery-only; payment authority is isPaid.
 */
export async function enrichHolderRewardEntitlements(args: {
  publicClient: PublicClient;
  entitlements: HolderRewardEntitlementDto[];
}): Promise<HolderRewardEnrichedRow[]> {
  const rows: HolderRewardEnrichedRow[] = [];

  for (const entitlement of args.entitlements) {
    if (!isAddress(entitlement.vault) || !isAddress(entitlement.asset)) {
      rows.push({
        entitlement,
        durableState: 'error',
        reason: 'Invalid vault or asset address',
        isPaid: false,
        round: null,
        proofCheck: null,
      });
      continue;
    }

    if (entitlement.chainId !== ROBINHOOD_CHAIN_ID) {
      rows.push({
        entitlement,
        durableState: 'unavailable',
        reason: 'Unsupported chain',
        isPaid: false,
        round: null,
        proofCheck: null,
      });
      continue;
    }

    let round: HolderRewardOnChainRound | null = null;
    let isPaid = false;
    let readError: string | null = null;

    try {
      const roundId = BigInt(entitlement.roundId);
      const [roundResult, paidResult] = await Promise.all([
        readHolderRewardRound({
          publicClient: args.publicClient,
          vault: entitlement.vault,
          roundId,
          asset: entitlement.asset,
        }),
        readHolderRewardIsPaid({
          publicClient: args.publicClient,
          vault: entitlement.vault,
          roundId,
          asset: entitlement.asset,
          account: entitlement.account,
        }),
      ]);
      round = roundResult;
      isPaid = paidResult;
    } catch (error) {
      readError =
        error instanceof Error ? error.message : 'Could not read vault state';
    }

    let proofCheck: EntitlementProofCheckResult | null = null;
    if (!readError && round?.published && !isPaid) {
      proofCheck = verifyEntitlementProofAgainstRoot({
        chainId: entitlement.chainId,
        vault: entitlement.vault,
        roundId: BigInt(entitlement.roundId),
        asset: entitlement.asset,
        account: entitlement.account,
        amount: BigInt(entitlement.entitlementRaw),
        proof: entitlement.proof,
        storedLeafHash: entitlement.leafHash,
        workerMerkleRoot: entitlement.workerMerkleRoot,
        onChainRoot: round.merkleRoot,
      });
    }

    const derived = deriveHolderRewardUiState({
      isPaid,
      roundPublished: Boolean(round?.published),
      onChainRoot: round?.merkleRoot ?? null,
      readError,
      proofCheck: isPaid ? null : proofCheck,
    });

    rows.push({
      entitlement,
      durableState: derived.state,
      reason: derived.reason,
      isPaid,
      round,
      proofCheck,
    });
  }

  return rows;
}

export function holderRewardRowKey(entitlement: HolderRewardEntitlementDto): string {
  return [
    entitlement.chainId,
    entitlement.vault.toLowerCase(),
    entitlement.roundId,
    entitlement.asset.toLowerCase(),
    entitlement.account.toLowerCase(),
  ].join(':');
}
