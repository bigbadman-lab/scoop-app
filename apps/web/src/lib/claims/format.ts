import { formatEther, formatUnits, type Address } from 'viem';
import type { ClaimAsset } from './types';

/** Format claimable/claimed amounts without Number() conversion. */
export function formatClaimAmount(raw: bigint, decimals: number, maxFrac = 6): string {
  if (raw === BigInt(0)) return '0';
  if (decimals === 18 && maxFrac <= 18) {
    const full = formatEther(raw);
    return trimFrac(full, maxFrac);
  }
  const full = formatUnits(raw, decimals);
  return trimFrac(full, Math.min(maxFrac, decimals));
}

function trimFrac(value: string, maxFrac: number): string {
  if (!value.includes('.')) return value;
  const [whole, frac = ''] = value.split('.');
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

export function shortenAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function claimAssetKey(asset: ClaimAsset): string {
  return `${asset.kind}:${asset.assetAddress.toLowerCase()}`;
}
