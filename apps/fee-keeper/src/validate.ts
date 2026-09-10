import type { FeeKeeperMarket } from '@scoop/db';
import { zeroAddress } from 'viem';

export type MarketValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function validateFeeKeeperMarket(market: FeeKeeperMarket): MarketValidation {
  if (!Number.isInteger(market.chainId) || market.chainId <= 0) {
    return { ok: false, code: 'malformed_market', message: 'invalid chainId' };
  }
  if (!isAddr(market.tokenAddress) || market.tokenAddress === zeroAddress) {
    return { ok: false, code: 'malformed_market', message: 'invalid tokenAddress' };
  }
  if (!isAddr(market.liquidityLocker) || market.liquidityLocker === zeroAddress) {
    return { ok: false, code: 'malformed_market', message: 'invalid liquidityLocker' };
  }
  if (!isAddr(market.feeDistributor) || market.feeDistributor === zeroAddress) {
    return { ok: false, code: 'malformed_market', message: 'invalid feeDistributor' };
  }
  if (!isAddr(market.quoteAsset)) {
    return { ok: false, code: 'malformed_market', message: 'invalid quoteAsset' };
  }
  if (market.holderRewards != null) {
    if (!isAddr(market.holderRewards) || market.holderRewards === zeroAddress) {
      return {
        ok: false,
        code: 'malformed_market',
        message: 'invalid holderRewards',
      };
    }
  }
  const lp = BigInt(market.lpTokenId);
  if (lp <= 0n) {
    return { ok: false, code: 'malformed_market', message: 'lpTokenId must be > 0' };
  }
  return { ok: true };
}

function isAddr(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
