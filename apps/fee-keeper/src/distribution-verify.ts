/**
 * Canonical + historical FeeDistributor receipt verification.
 * Enforces base/extra conservation and HolderRewardDeposited when holders > 0.
 */
import {
  type Address,
  type Hex,
  type Log,
  type TransactionReceipt,
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  zeroAddress,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import {
  assertDistributionConservation,
  distributionConserves,
  isCanonicalDistributionArgs,
  normalizeFeeDistributionArgs,
  type NormalizedFeeDistributionLegs,
} from '@scoop/shared';
import type { FeeKeeperDeploymentMode } from './config.js';
import type { DistributionAction } from './classify.js';

const canonicalDistributorAbi = scoopAbis.ScoopFeeDistributor;
const historicalDistributorAbi = scoopAbis.ScoopFeeDistributorHistoricalCanary;
const holderRewardsAbi = scoopAbis.ScoopHolderRewards;

export type DistributionAbiVariant = 'canonical' | 'historical';

export type DistributionEconomics = {
  asset: Address;
  totalRaw: bigint;
  baseCreatorRaw: bigint;
  baseHoldersRaw: bigint;
  baseDeployerRaw: bigint;
  baseProtocolRaw: bigint;
  baseOperationsRaw: bigint;
  extraCreatorRaw: bigint;
  extraDeployerRaw: bigint;
  extraHoldersRaw: bigint;
  creatorTotalRaw: bigint;
  deployerTotalRaw: bigint;
  holdersTotalRaw: bigint;
  protocolRaw: bigint;
  operationsRaw: bigint;
};

export type DistributionVerificationSuccess = {
  ok: true;
  abiVariant: DistributionAbiVariant;
  legs: NormalizedFeeDistributionLegs;
  economics: DistributionEconomics;
  conservationOk: true;
  /** True when holdersTotal==0 (no deposit required) or deposit matched. */
  holderDepositVerified: boolean;
  holderRewards: Address | null;
};

export type DistributionVerificationFailure = {
  ok: false;
  error: string;
  abiVariant?: DistributionAbiVariant;
  legs?: NormalizedFeeDistributionLegs;
  economics?: DistributionEconomics;
  conservationOk?: boolean;
  holderDepositVerified?: boolean;
  holderRewards?: Address | null;
};

export type DistributionVerification =
  | DistributionVerificationSuccess
  | DistributionVerificationFailure;

function assetForAction(action: DistributionAction): Address {
  return action.kind === 'eth' ? zeroAddress : action.token;
}

function economicsFromLegs(
  asset: Address,
  legs: NormalizedFeeDistributionLegs,
): DistributionEconomics {
  return {
    asset,
    totalRaw: legs.totalRaw,
    baseCreatorRaw: legs.baseCreatorRaw,
    baseHoldersRaw: legs.baseHoldersRaw,
    baseDeployerRaw: legs.baseDeployerRaw,
    baseProtocolRaw: legs.baseProtocolRaw,
    baseOperationsRaw: legs.baseOperationsRaw,
    extraCreatorRaw: legs.extraCreatorRaw,
    extraDeployerRaw: legs.extraDeployerRaw,
    extraHoldersRaw: legs.extraHoldersRaw,
    creatorTotalRaw: legs.creatorRaw,
    deployerTotalRaw: legs.deployerRaw,
    holdersTotalRaw: legs.holdersRaw,
    protocolRaw: legs.buybackRaw,
    operationsRaw: legs.operationsRaw,
  };
}

/** Structured log fields (bigint → string). */
export function economicsLogFields(
  economics: DistributionEconomics,
  extras: {
    holderRewards: Address | null;
    conservationOk: boolean;
    holderDepositVerified: boolean;
    abiVariant: DistributionAbiVariant;
  },
): Record<string, unknown> {
  return {
    asset: economics.asset,
    totalRaw: economics.totalRaw.toString(),
    baseCreatorRaw: economics.baseCreatorRaw.toString(),
    baseHoldersRaw: economics.baseHoldersRaw.toString(),
    baseDeployerRaw: economics.baseDeployerRaw.toString(),
    baseProtocolRaw: economics.baseProtocolRaw.toString(),
    baseOperationsRaw: economics.baseOperationsRaw.toString(),
    extraCreatorRaw: economics.extraCreatorRaw.toString(),
    extraDeployerRaw: economics.extraDeployerRaw.toString(),
    extraHoldersRaw: economics.extraHoldersRaw.toString(),
    creatorTotalRaw: economics.creatorTotalRaw.toString(),
    deployerTotalRaw: economics.deployerTotalRaw.toString(),
    holdersTotalRaw: economics.holdersTotalRaw.toString(),
    protocolRaw: economics.protocolRaw.toString(),
    operationsRaw: economics.operationsRaw.toString(),
    holderRewards: extras.holderRewards,
    conservationOk: extras.conservationOk,
    holderDepositVerified: extras.holderDepositVerified,
    abiVariant: extras.abiVariant,
  };
}

type DecodedDistribution = {
  abiVariant: DistributionAbiVariant;
  args: Record<string, unknown>;
  token?: Address;
};

function tryDecodeDistributorLog(
  log: Log,
  abi: typeof canonicalDistributorAbi | typeof historicalDistributorAbi,
  variant: DistributionAbiVariant,
  action: DistributionAction,
): DecodedDistribution | null {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
    });
    if (action.kind === 'eth' && decoded.eventName === 'ETHDistributed') {
      return {
        abiVariant: variant,
        args: decoded.args as unknown as Record<string, unknown>,
      };
    }
    if (action.kind === 'token' && decoded.eventName === 'TokenDistributed') {
      const token = (decoded.args as { token?: Address }).token;
      if (
        token &&
        token.toLowerCase() !== action.token.toLowerCase()
      ) {
        return null;
      }
      return {
        abiVariant: variant,
        args: decoded.args as unknown as Record<string, unknown>,
        token,
      };
    }
  } catch {
    /* not this ABI */
  }
  return null;
}

function findDistributionEvent(
  receipt: TransactionReceipt,
  feeDistributor: Address,
  action: DistributionAction,
  deploymentMode: FeeKeeperDeploymentMode,
): DecodedDistribution | null {
  const addr = feeDistributor.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== addr) continue;

    const canonical = tryDecodeDistributorLog(
      log,
      canonicalDistributorAbi,
      'canonical',
      action,
    );
    if (canonical) {
      // Canonical production must not accept historical-only shapes.
      if (
        deploymentMode === 'canonical-production' &&
        !isCanonicalDistributionArgs(canonical.args)
      ) {
        continue;
      }
      return canonical;
    }

    if (deploymentMode === 'historical-test') {
      const historical = tryDecodeDistributorLog(
        log,
        historicalDistributorAbi,
        'historical',
        action,
      );
      if (historical) return historical;
    }
  }
  return null;
}

function findHolderDepositAmount(
  receipt: TransactionReceipt,
  vault: Address,
  asset: Address,
): bigint | null {
  const vaultAddr = vault.toLowerCase();
  const assetAddr = asset.toLowerCase();
  let total: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vaultAddr) continue;
    try {
      const decoded = decodeEventLog({
        abi: holderRewardsAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'HolderRewardDeposited') continue;
      const args = decoded.args as { asset?: Address; amount?: bigint };
      if (!args.asset || args.amount == null) continue;
      if (args.asset.toLowerCase() !== assetAddr) continue;
      total = (total ?? 0n) + BigInt(args.amount);
    } catch {
      /* ignore */
    }
  }
  return total;
}

/**
 * Verify a distributeETH / distributeToken receipt.
 * Fails closed on missing event, conservation mismatch, or missing holder deposit.
 */
export function verifyDistributionReceipt(input: {
  receipt: TransactionReceipt;
  feeDistributor: Address;
  action: DistributionAction;
  deploymentMode: FeeKeeperDeploymentMode;
  holderRewards: Address | null;
}): DistributionVerification {
  const decoded = findDistributionEvent(
    input.receipt,
    input.feeDistributor,
    input.action,
    input.deploymentMode,
  );
  if (!decoded) {
    return {
      ok: false,
      error:
        input.deploymentMode === 'canonical-production'
          ? 'missing_canonical_distribution_event'
          : 'missing_distribution_event',
      holderRewards: input.holderRewards,
    };
  }

  let legs: NormalizedFeeDistributionLegs;
  try {
    legs = normalizeFeeDistributionArgs(decoded.args);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      abiVariant: decoded.abiVariant,
      holderRewards: input.holderRewards,
    };
  }

  const asset =
    input.action.kind === 'eth'
      ? zeroAddress
      : ((decoded.token as Address | undefined) ?? input.action.token);
  const economics = economicsFromLegs(asset, legs);

  if (decoded.abiVariant === 'canonical' || isCanonicalDistributionArgs(decoded.args)) {
    if (!distributionConserves(legs)) {
      try {
        assertDistributionConservation(legs);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          abiVariant: decoded.abiVariant,
          legs,
          economics,
          conservationOk: false,
          holderRewards: input.holderRewards,
        };
      }
    }
  } else {
    // Historical aggregate: creator+deployer+buyback+operations == total
    const histSum =
      legs.creatorRaw + legs.deployerRaw + legs.buybackRaw + legs.operationsRaw;
    if (histSum !== legs.totalRaw) {
      return {
        ok: false,
        error: `historical distribution conservation failed: sum=${histSum.toString()} total=${legs.totalRaw.toString()}`,
        abiVariant: 'historical',
        legs,
        economics,
        conservationOk: false,
        holderRewards: input.holderRewards,
      };
    }
  }

  const holdersTotal = legs.holdersRaw;
  if (holdersTotal === 0n) {
    return {
      ok: true,
      abiVariant: decoded.abiVariant,
      legs,
      economics,
      conservationOk: true,
      holderDepositVerified: true,
      holderRewards: input.holderRewards,
    };
  }

  if (!input.holderRewards) {
    return {
      ok: false,
      error: 'holders_leg_nonzero_but_holder_rewards_null',
      abiVariant: decoded.abiVariant,
      legs,
      economics,
      conservationOk: true,
      holderDepositVerified: false,
      holderRewards: null,
    };
  }

  const deposited = findHolderDepositAmount(
    input.receipt,
    input.holderRewards,
    asset,
  );
  if (deposited == null) {
    return {
      ok: false,
      error: 'missing_holder_reward_deposited',
      abiVariant: decoded.abiVariant,
      legs,
      economics,
      conservationOk: true,
      holderDepositVerified: false,
      holderRewards: input.holderRewards,
    };
  }
  if (deposited !== holdersTotal) {
    return {
      ok: false,
      error: `holder_deposit_amount_mismatch: expected=${holdersTotal.toString()} got=${deposited.toString()}`,
      abiVariant: decoded.abiVariant,
      legs,
      economics,
      conservationOk: true,
      holderDepositVerified: false,
      holderRewards: input.holderRewards,
    };
  }

  return {
    ok: true,
    abiVariant: decoded.abiVariant,
    legs,
    economics,
    conservationOk: true,
    holderDepositVerified: true,
    holderRewards: input.holderRewards,
  };
}

/** Soft presence check used by older tests. */
export function receiptHasDistributionEvent(
  receipt: TransactionReceipt,
  feeDistributor: Address,
  action: DistributionAction,
  deploymentMode: FeeKeeperDeploymentMode = 'historical-test',
): boolean {
  return (
    findDistributionEvent(receipt, feeDistributor, action, deploymentMode) !=
    null
  );
}

function stubLog(address: Address, data: Hex, topics: Hex[]): Log {
  return {
    address,
    data,
    topics,
    blockHash: '0x0',
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: '0x0',
    transactionIndex: 0,
    removed: false,
  } as unknown as Log;
}

/** Test helper: build a HolderRewardDeposited log. */
export function encodeHolderRewardDepositedLog(input: {
  vault: Address;
  asset: Address;
  amount: bigint;
}): Log {
  const topics = encodeEventTopics({
    abi: holderRewardsAbi,
    eventName: 'HolderRewardDeposited',
    args: { asset: input.asset },
  }) as Hex[];
  const data = encodeAbiParameters(
    [{ type: 'uint256', name: 'amount' }],
    [input.amount],
  );
  return stubLog(input.vault, data, topics);
}

const distributionNonIndexed = [
  { type: 'uint256', name: 'totalAmount' },
  { type: 'uint256', name: 'basePart' },
  { type: 'uint256', name: 'extraPart' },
  { type: 'uint256', name: 'baseCreatorAmount' },
  { type: 'uint256', name: 'baseHoldersAmount' },
  { type: 'uint256', name: 'baseDeployerAmount' },
  { type: 'uint256', name: 'baseBuybackAmount' },
  { type: 'uint256', name: 'baseOperationsAmount' },
  { type: 'uint256', name: 'extraCreatorAmount' },
  { type: 'uint256', name: 'extraDeployerAmount' },
  { type: 'uint256', name: 'extraHoldersAmount' },
] as const;

/** Test helper: build canonical ETHDistributed / TokenDistributed log. */
export function encodeCanonicalDistributionLog(input: {
  feeDistributor: Address;
  action: DistributionAction;
  legs: {
    totalAmount: bigint;
    basePart?: bigint;
    extraPart?: bigint;
    baseCreatorAmount: bigint;
    baseHoldersAmount: bigint;
    baseDeployerAmount: bigint;
    baseBuybackAmount: bigint;
    baseOperationsAmount: bigint;
    extraCreatorAmount: bigint;
    extraDeployerAmount: bigint;
    extraHoldersAmount: bigint;
  };
}): Log {
  const basePart =
    input.legs.basePart ??
    input.legs.baseCreatorAmount +
      input.legs.baseHoldersAmount +
      input.legs.baseDeployerAmount +
      input.legs.baseBuybackAmount +
      input.legs.baseOperationsAmount;
  const extraPart =
    input.legs.extraPart ??
    input.legs.extraCreatorAmount +
      input.legs.extraDeployerAmount +
      input.legs.extraHoldersAmount;
  const values = [
    input.legs.totalAmount,
    basePart,
    extraPart,
    input.legs.baseCreatorAmount,
    input.legs.baseHoldersAmount,
    input.legs.baseDeployerAmount,
    input.legs.baseBuybackAmount,
    input.legs.baseOperationsAmount,
    input.legs.extraCreatorAmount,
    input.legs.extraDeployerAmount,
    input.legs.extraHoldersAmount,
  ] as const;

  if (input.action.kind === 'eth') {
    const topics = encodeEventTopics({
      abi: canonicalDistributorAbi,
      eventName: 'ETHDistributed',
    }) as Hex[];
    const data = encodeAbiParameters(distributionNonIndexed, [...values]);
    return stubLog(input.feeDistributor, data, topics);
  }

  const topics = encodeEventTopics({
    abi: canonicalDistributorAbi,
    eventName: 'TokenDistributed',
    args: { token: input.action.token },
  }) as Hex[];
  const data = encodeAbiParameters(distributionNonIndexed, [...values]);
  return stubLog(input.feeDistributor, data, topics);
}

export { assetForAction };
