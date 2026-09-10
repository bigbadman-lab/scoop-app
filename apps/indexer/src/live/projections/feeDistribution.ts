/**
 * Normalize FeeDistributor ETHDistributed / TokenDistributed args across
 * historical canary ABI and canonical P3 base/extra ABI.
 */
export interface NormalizedFeeDistributionLegs {
  totalRaw: bigint;
  baseCreatorRaw: bigint;
  baseHoldersRaw: bigint;
  baseDeployerRaw: bigint;
  baseProtocolRaw: bigint;
  baseOperationsRaw: bigint;
  extraCreatorRaw: bigint;
  extraDeployerRaw: bigint;
  extraHoldersRaw: bigint;
  creatorRaw: bigint;
  deployerRaw: bigint;
  buybackRaw: bigint;
  operationsRaw: bigint;
  holdersRaw: bigint;
}

function asBigInt(value: unknown, label: string): bigint {
  if (value == null) throw new Error(`Missing fee distribution field: ${label}`);
  return BigInt(String(value));
}

function optionalBigInt(value: unknown): bigint | null {
  if (value == null) return null;
  return BigInt(String(value));
}

/** True when args look like P3 base/extra distribution events. */
export function isCanonicalDistributionArgs(args: Record<string, unknown>): boolean {
  return (
    args.baseCreatorAmount != null ||
    args.basePart != null ||
    args.extraPart != null ||
    args.baseHoldersAmount != null
  );
}

export function normalizeFeeDistributionArgs(
  args: Record<string, unknown>,
): NormalizedFeeDistributionLegs {
  if (isCanonicalDistributionArgs(args)) {
    const baseCreatorRaw = asBigInt(args.baseCreatorAmount, 'baseCreatorAmount');
    const baseHoldersRaw = asBigInt(args.baseHoldersAmount, 'baseHoldersAmount');
    const baseDeployerRaw = asBigInt(args.baseDeployerAmount, 'baseDeployerAmount');
    const baseProtocolRaw = asBigInt(args.baseBuybackAmount, 'baseBuybackAmount');
    const baseOperationsRaw = asBigInt(
      args.baseOperationsAmount,
      'baseOperationsAmount',
    );
    const extraCreatorRaw = asBigInt(args.extraCreatorAmount, 'extraCreatorAmount');
    const extraDeployerRaw = asBigInt(args.extraDeployerAmount, 'extraDeployerAmount');
    const extraHoldersRaw = asBigInt(args.extraHoldersAmount, 'extraHoldersAmount');
    const totalRaw = asBigInt(args.totalAmount, 'totalAmount');
    const creatorRaw = baseCreatorRaw + extraCreatorRaw;
    const deployerRaw = baseDeployerRaw + extraDeployerRaw;
    const holdersRaw = baseHoldersRaw + extraHoldersRaw;
    return {
      totalRaw,
      baseCreatorRaw,
      baseHoldersRaw,
      baseDeployerRaw,
      baseProtocolRaw,
      baseOperationsRaw,
      extraCreatorRaw,
      extraDeployerRaw,
      extraHoldersRaw,
      creatorRaw,
      deployerRaw,
      buybackRaw: baseProtocolRaw,
      operationsRaw: baseOperationsRaw,
      holdersRaw,
    };
  }

  // Historical canary: creatorRewardsAmount / deployerAmount / buyback / operations.
  const creatorRaw = asBigInt(
    optionalBigInt(args.creatorRewardsAmount) ?? args.creatorAmount,
    'creatorRewardsAmount',
  );
  const deployerRaw = asBigInt(args.deployerAmount, 'deployerAmount');
  const buybackRaw = asBigInt(args.buybackAmount, 'buybackAmount');
  const operationsRaw = asBigInt(args.operationsAmount, 'operationsAmount');
  const totalRaw = asBigInt(args.totalAmount, 'totalAmount');
  return {
    totalRaw,
    baseCreatorRaw: creatorRaw,
    baseHoldersRaw: 0n,
    baseDeployerRaw: deployerRaw,
    baseProtocolRaw: buybackRaw,
    baseOperationsRaw: operationsRaw,
    extraCreatorRaw: 0n,
    extraDeployerRaw: 0n,
    extraHoldersRaw: 0n,
    creatorRaw,
    deployerRaw,
    buybackRaw,
    operationsRaw,
    holdersRaw: 0n,
  };
}
