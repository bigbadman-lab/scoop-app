import type { Address, Hex } from 'viem';

/** API / discovery DTO — proofs are public Merkle data, not secrets. */
export type HolderRewardEntitlementDto = {
  chainId: number;
  vault: Address;
  tokenAddress: Address;
  roundId: string;
  asset: Address;
  account: Address;
  entitlementRaw: string;
  leafHash: Hex;
  proof: Hex[];
  snapshotBlock: string;
  workerRoundStatus: string;
  workerMerkleRoot: Hex | null;
  publishedTxHash: Hex | null;
};

export type HolderRewardOnChainRound = {
  merkleRoot: Hex;
  totalCommitted: bigint;
  published: boolean;
};

/** Durable UI state after on-chain verification. */
export type HolderRewardDurableState =
  | 'pending'
  | 'claimable'
  | 'paid'
  | 'unavailable'
  | 'error';

/** Local claim transaction phases (mirrors creator claims). */
export type HolderRewardClaimPhase =
  | 'idle'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'success'
  | 'error';

export type HolderRewardClaimSuccess = {
  txHash: Hex;
  amountRaw: bigint;
  vault: Address;
  roundId: bigint;
  asset: Address;
  account: Address;
};

export type PublicHolderRewardsResponse = {
  enabled: boolean;
  account: string | null;
  entitlements: HolderRewardEntitlementDto[];
};
