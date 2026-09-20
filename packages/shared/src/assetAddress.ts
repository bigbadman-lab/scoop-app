/**
 * Chain-aware asset address normalization (Gate E).
 * Keep Robinhood `normalizeAddress` / packages/db hex helpers for EVM-only call sites.
 *
 * Solana: validate base58 PublicKey shape and return trimmed canonical form.
 * Full on-curve checks happen at the API boundary via @solana/web3.js when available.
 */

export type AssetChain = 'robinhood' | 'solana';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isEvmAddressShape(raw: string): boolean {
  return EVM_ADDRESS_RE.test(raw.trim());
}

export function isSolanaAddressShape(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.startsWith('0x')) return false;
  return SOLANA_BASE58_RE.test(t);
}

export function normalizeAssetAddress(args: {
  chain: AssetChain;
  address: string;
}): string {
  const raw = args.address.trim();
  if (args.chain === 'robinhood') {
    if (!EVM_ADDRESS_RE.test(raw)) {
      throw new Error(`Invalid Robinhood address: ${args.address}`);
    }
    return raw.toLowerCase();
  }
  if (!isSolanaAddressShape(raw)) {
    throw new Error(`Invalid Solana address: ${args.address}`);
  }
  // Preserve base58 as provided (Solana addresses are case-sensitive).
  return raw;
}

/** Solana transaction signatures are base58 and typically longer than mint keys. */
export function isSolanaSignatureShape(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.startsWith('0x')) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(t);
}

export function normalizeSolanaSignature(raw: string): string {
  const t = raw.trim();
  if (!isSolanaSignatureShape(t)) {
    throw new Error(`Invalid Solana signature: ${raw}`);
  }
  return t;
}
