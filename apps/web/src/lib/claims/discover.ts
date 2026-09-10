import { isAddress, zeroAddress, type Address } from 'viem';
import type { ClaimAsset } from './types';
import { isNativeEthAddress } from './read-claimable';

/** Map account/DB fee lines into ClaimAsset discovery rows. */
export function discoverClaimAssetsFromFeeLines(
  lines: Array<{
    assetKind: string;
    assetAddress: string;
    symbol?: string;
    name?: string | null;
    decimals?: number | null;
    displayImageUrl?: string | null;
    claimableRaw?: string;
    creditedRaw?: string;
    claimedRaw?: string;
  }>,
): ClaimAsset[] {
  const out: ClaimAsset[] = [];
  for (const line of lines) {
    const addr = line.assetAddress.toLowerCase();
    if (line.assetKind === 'eth' || isNativeEthAddress(addr)) {
      out.push({
        kind: 'eth',
        assetAddress: zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        cachedClaimableRaw: line.claimableRaw,
        creditedRaw: line.creditedRaw,
        claimedRaw: line.claimedRaw,
      });
      continue;
    }
    if (!isAddress(addr)) continue;
    const token = addr as Address;
    const decimals =
      typeof line.decimals === 'number' && Number.isInteger(line.decimals) && line.decimals > 0
        ? line.decimals
        : 18;
    const symbol =
      line.symbol && line.symbol !== 'TOKEN' ? line.symbol : 'TOKEN';
    const name = line.name?.trim() || symbol;
    out.push({
      kind: 'token',
      assetAddress: token,
      symbol,
      name,
      decimals,
      displayImageUrl: line.displayImageUrl ?? null,
      tokenPageUrl: `/token/${token}`,
      cachedClaimableRaw: line.claimableRaw,
      creditedRaw: line.creditedRaw,
      claimedRaw: line.claimedRaw,
    });
  }
  return out;
}
