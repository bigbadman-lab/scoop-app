import type { Address, Hex } from 'viem';
import { zeroAddress } from 'viem';

/** Wallet-creator claim identity (X deferred). */
export type WalletClaimIdentity = {
  kind: 'wallet';
  creatorId: Hex;
  wallet: Address;
};

export type ClaimAssetEth = {
  kind: 'eth';
  assetAddress: typeof zeroAddress;
  symbol: 'ETH';
  name: 'Ethereum';
  decimals: 18;
  displayImageUrl?: string | null;
  imageUri?: string | null;
  /** Cached indexer claimable — discovery only. */
  cachedClaimableRaw?: string;
  creditedRaw?: string;
  claimedRaw?: string;
};

export type ClaimAssetToken = {
  kind: 'token';
  assetAddress: Address;
  symbol: string;
  name: string;
  decimals: number;
  displayImageUrl?: string | null;
  imageUri?: string | null;
  tokenPageUrl?: string | null;
  cachedClaimableRaw?: string;
  creditedRaw?: string;
  claimedRaw?: string;
};

export type ClaimAsset = ClaimAssetEth | ClaimAssetToken;

export type ClaimRowPhase =
  | 'idle'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'success'
  | 'error';

export type ClaimSectionPhase = 'no_wallet' | 'loading' | 'empty' | 'ready';

export type ClaimSuccess = {
  txHash: Hex;
  amountRaw: bigint;
  creatorId: Hex;
  recipient: Address;
  asset: ClaimAsset;
};
