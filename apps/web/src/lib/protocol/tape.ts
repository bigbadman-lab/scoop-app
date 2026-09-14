import { getAddress, isAddress } from 'viem';

export const TAPE_TOKEN_SYMBOL = 'TAPE' as const;
export const TAPE_TOKEN_NAME = 'Trade the Tape' as const;

/**
 * Checksum a runtime DB address for display.
 * Invalid / null → null (never invent).
 */
export function checksumTapeAddress(
  raw: string | null | undefined,
): `0x${string}` | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || !isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}
