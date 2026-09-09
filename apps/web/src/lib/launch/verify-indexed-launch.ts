import type { LaunchMarketReady } from '@scoop/db';

/** Receipt-side expectations used to verify an indexed launch row. */
export type IndexedLaunchExpectation = {
  chainId: number;
  tokenAddress: string;
  txHash: string;
  creatorId?: string | null;
  quoteAsset?: string | null;
  deployer?: string | null;
  poolId?: string | null;
  feeDistributor?: string | null;
  liquidityLocker?: string | null;
};

function normAddr(value: string): string {
  return value.trim().toLowerCase();
}

function normBytes32(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Verify canonical indexed launch matches the TokenLaunched receipt.
 * Does NOT compare creator_type / wallet_address (known indexer caveat).
 */
export function verifyIndexedLaunchAgainstReceipt(
  launch: LaunchMarketReady,
  expected: IndexedLaunchExpectation,
): { ok: true } | { ok: false; mismatches: string[] } {
  const mismatches: string[] = [];

  if (launch.chainId !== expected.chainId) {
    mismatches.push('chainId');
  }
  if (normAddr(launch.tokenAddress) !== normAddr(expected.tokenAddress)) {
    mismatches.push('tokenAddress');
  }
  if (normBytes32(launch.launchTxHash) !== normBytes32(expected.txHash)) {
    mismatches.push('launchTxHash');
  }

  if (expected.creatorId) {
    if (normBytes32(launch.creatorId) !== normBytes32(expected.creatorId)) {
      mismatches.push('creatorId');
    }
  }
  if (expected.quoteAsset) {
    if (normAddr(launch.quoteAsset) !== normAddr(expected.quoteAsset)) {
      mismatches.push('quoteAsset');
    }
  }
  if (expected.deployer) {
    if (normAddr(launch.deployerAddress) !== normAddr(expected.deployer)) {
      mismatches.push('deployer');
    }
  }
  if (expected.poolId) {
    if (normBytes32(launch.poolId) !== normBytes32(expected.poolId)) {
      mismatches.push('poolId');
    }
  }
  if (expected.feeDistributor) {
    if (
      normAddr(launch.feeDistributorAddress) !==
      normAddr(expected.feeDistributor)
    ) {
      mismatches.push('feeDistributor');
    }
  }
  if (expected.liquidityLocker) {
    if (
      normAddr(launch.liquidityLockerAddress) !==
      normAddr(expected.liquidityLocker)
    ) {
      mismatches.push('liquidityLocker');
    }
  }

  return mismatches.length === 0 ? { ok: true } : { ok: false, mismatches };
}
