import { getAddress } from 'viem';

/**
 * Checksummed EIP-55 address, or null if invalid.
 * Case-insensitive: mixed-case non-EIP-55 strings are accepted after lowercasing
 * (viem's default isAddress strict mode would reject them and block SIWE).
 */
export function normalizeAddress(raw: string): `0x${string}` | null {
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null;
  try {
    return getAddress(trimmed.toLowerCase() as `0x${string}`);
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

/** True when both strings are the same EVM address (checksum/casing ignored). */
export function addressesEqual(a: string, b: string): boolean {
  const left = sessionAddress(a);
  const right = sessionAddress(b);
  return left != null && right != null && left === right;
}
