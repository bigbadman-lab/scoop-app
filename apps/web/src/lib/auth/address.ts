import { getAddress, isAddress } from 'viem';

/** Checksummed EIP-55 address, or null if invalid. */
export function normalizeAddress(raw: string): `0x${string}` | null {
  const trimmed = raw.trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

/** Lowercase session identity address. */
export function sessionAddress(raw: string): `0x${string}` | null {
  const normalized = normalizeAddress(raw);
  if (!normalized) return null;
  return normalized.toLowerCase() as `0x${string}`;
}
