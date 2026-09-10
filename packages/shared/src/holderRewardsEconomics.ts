/**
 * Holder eligibility + pro-rata entitlements with deterministic largest-remainder dust.
 */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

function normalizeAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase();
}

export type EligibilityExclusionReason =
  | 'zero_address'
  | 'dead_address'
  | 'launch_token'
  | 'holder_rewards_vault'
  | 'fee_distributor'
  | 'liquidity_locker'
  | 'factory'
  | 'pool_manager'
  | 'other_system'
  | 'non_positive_balance';

export type HolderEligibilityInput = {
  address: string;
  balanceRaw: bigint;
  launchToken: string;
  holderRewardsVault: string;
  feeDistributor: string;
  liquidityLocker: string;
  factory?: string | null;
  poolManager?: string | null;
  extraSystemAddresses?: readonly string[];
};

export type HolderEligibilityResult =
  | { eligible: true; address: string; balanceRaw: bigint }
  | {
      eligible: false;
      address: string;
      balanceRaw: bigint;
      reason: EligibilityExclusionReason;
    };

export function classifyHolderEligibility(
  input: HolderEligibilityInput,
): HolderEligibilityResult {
  const address = normalizeAddress(input.address);
  const balanceRaw = input.balanceRaw;
  if (balanceRaw <= 0n) {
    return {
      eligible: false,
      address,
      balanceRaw,
      reason: 'non_positive_balance',
    };
  }
  if (address === ZERO_ADDRESS) {
    return { eligible: false, address, balanceRaw, reason: 'zero_address' };
  }
  if (address === DEAD_ADDRESS) {
    return { eligible: false, address, balanceRaw, reason: 'dead_address' };
  }
  if (address === normalizeAddress(input.launchToken)) {
    return { eligible: false, address, balanceRaw, reason: 'launch_token' };
  }
  if (address === normalizeAddress(input.holderRewardsVault)) {
    return {
      eligible: false,
      address,
      balanceRaw,
      reason: 'holder_rewards_vault',
    };
  }
  if (address === normalizeAddress(input.feeDistributor)) {
    return { eligible: false, address, balanceRaw, reason: 'fee_distributor' };
  }
  if (address === normalizeAddress(input.liquidityLocker)) {
    return { eligible: false, address, balanceRaw, reason: 'liquidity_locker' };
  }
  if (input.factory && address === normalizeAddress(input.factory)) {
    return { eligible: false, address, balanceRaw, reason: 'factory' };
  }
  if (input.poolManager && address === normalizeAddress(input.poolManager)) {
    return { eligible: false, address, balanceRaw, reason: 'pool_manager' };
  }
  for (const extra of input.extraSystemAddresses ?? []) {
    if (address === normalizeAddress(extra)) {
      return { eligible: false, address, balanceRaw, reason: 'other_system' };
    }
  }
  return { eligible: true, address, balanceRaw };
}

export type Entitlement = {
  account: string;
  balanceRaw: bigint;
  entitlementRaw: bigint;
};

/**
 * floor(R * b_i / S) then distribute remainder by largest fractional part,
 * tie-break by address ascending. Guarantees sum(entitlements) === rewardAmount.
 */
export function computeHolderEntitlements(args: {
  rewardAmount: bigint;
  holders: Array<{ address: string; balanceRaw: bigint }>;
}): {
  eligibleSupply: bigint;
  entitlements: Entitlement[];
  remainderDistributed: bigint;
} {
  if (args.rewardAmount <= 0n) {
    throw new Error('rewardAmount must be positive');
  }
  const positive = args.holders
    .map((h) => ({
      address: normalizeAddress(h.address),
      balanceRaw: h.balanceRaw,
    }))
    .filter((h) => h.balanceRaw > 0n)
    .sort((a, b) => a.address.localeCompare(b.address));

  let eligibleSupply = 0n;
  for (const h of positive) eligibleSupply += h.balanceRaw;
  if (eligibleSupply <= 0n) {
    throw new Error('eligibleSupply must be positive');
  }

  type Row = {
    address: string;
    balanceRaw: bigint;
    floor: bigint;
    frac: bigint;
  };
  const rows: Row[] = positive.map((h) => {
    const prod = args.rewardAmount * h.balanceRaw;
    return {
      address: h.address,
      balanceRaw: h.balanceRaw,
      floor: prod / eligibleSupply,
      frac: prod % eligibleSupply,
    };
  });

  let assigned = 0n;
  for (const r of rows) assigned += r.floor;
  let remainder = args.rewardAmount - assigned;
  if (remainder < 0n) {
    throw new Error('entitlement floor sum exceeded reward');
  }

  const byRemainder = [...rows].sort((a, b) => {
    if (a.frac !== b.frac) return a.frac > b.frac ? -1 : 1;
    return a.address.localeCompare(b.address);
  });
  const bump = new Map<string, bigint>();
  for (const r of byRemainder) {
    if (remainder === 0n) break;
    bump.set(r.address, 1n);
    remainder -= 1n;
  }

  const entitlements: Entitlement[] = rows
    .map((r) => ({
      account: r.address,
      balanceRaw: r.balanceRaw,
      entitlementRaw: r.floor + (bump.get(r.address) ?? 0n),
    }))
    .filter((e) => e.entitlementRaw > 0n)
    .sort((a, b) => a.account.localeCompare(b.account));

  let sum = 0n;
  for (const e of entitlements) sum += e.entitlementRaw;
  if (sum !== args.rewardAmount) {
    throw new Error(
      `entitlement conservation failed: sum=${sum.toString()} reward=${args.rewardAmount.toString()}`,
    );
  }

  return {
    eligibleSupply,
    entitlements,
    remainderDistributed: args.rewardAmount - assigned,
  };
}

/** Hourly round id: floor(unixTime / 3600). */
export function roundIdFromUnix(unixSeconds: number): number {
  if (!Number.isFinite(unixSeconds) || unixSeconds < 0) {
    throw new Error(`invalid unixSeconds: ${unixSeconds}`);
  }
  return Math.floor(unixSeconds / 3600);
}

export function hourEndUnixFromRoundId(roundId: number): number {
  if (!Number.isInteger(roundId) || roundId < 0) {
    throw new Error(`invalid roundId: ${roundId}`);
  }
  return (roundId + 1) * 3600;
}

export function latestCompletableRoundId(nowUnix: number): number {
  const current = roundIdFromUnix(nowUnix);
  return Math.max(0, current - 1);
}

/**
 * Reconstruct balances from ordered transfers through snapshotBlock (inclusive).
 * Hard-fails on negative balance.
 */
export type SnapshotTransfer = {
  from: string;
  to: string;
  amount: bigint;
  blockNumber: number;
  logIndex: number;
};

export function reconstructBalancesAtSnapshot(
  transfers: SnapshotTransfer[],
  snapshotBlock: number,
): Map<string, bigint> {
  const ordered = [...transfers]
    .filter((t) => t.blockNumber <= snapshotBlock)
    .sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return a.logIndex - b.logIndex;
    });

  const balances = new Map<string, bigint>();
  const touch = (addr: string, delta: bigint) => {
    const key = normalizeAddress(addr);
    if (key === ZERO_ADDRESS) return;
    const next = (balances.get(key) ?? 0n) + delta;
    if (next < 0n) {
      throw new Error(
        `negative balance reconstruction for ${key} at snapshotBlock=${snapshotBlock}`,
      );
    }
    if (next === 0n) balances.delete(key);
    else balances.set(key, next);
  };

  for (const t of ordered) {
    if (t.amount < 0n) throw new Error('transfer amount must be non-negative');
    touch(t.from, -t.amount);
    touch(t.to, t.amount);
  }
  return balances;
}
