import { PublicKey } from '@solana/web3.js';

/** Parse a Solana base58 public key; return null if invalid. */
export function parseSolanaPublicKey(raw: string): PublicKey | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('0x')) return null;
  try {
    return new PublicKey(trimmed);
  } catch {
    return null;
  }
}

export function isSolanaPublicKeyString(raw: string): boolean {
  return parseSolanaPublicKey(raw) !== null;
}
