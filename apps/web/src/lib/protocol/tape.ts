import { getAddress, isAddress } from 'viem';

/**
 * Official $TAPE token contract.
 * Unset / invalid → public "To be announced" state (never invent an address).
 */
export function resolveTapeTokenAddress(
  env: NodeJS.ProcessEnv = process.env,
): `0x${string}` | null {
  const raw = (env.NEXT_PUBLIC_TAPE_TOKEN_ADDRESS ?? '').trim();
  if (!raw) return null;
  if (!isAddress(raw)) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export const TAPE_TOKEN_SYMBOL = 'TAPE' as const;
export const TAPE_TOKEN_NAME = 'Trade the Tape' as const;
