import bs58 from 'bs58';

/** True when `raw` is a base58-encoded 32-byte Solana public key. */
export function isSolanaPublicKey(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('0x')) return false;
  try {
    return bs58.decode(trimmed).length === 32;
  } catch {
    return false;
  }
}
