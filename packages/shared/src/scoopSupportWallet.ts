/**
 * Public SCOOP ecosystem support wallet — tracks confirmed Pump buys only.
 * Never store or use a private key for this address.
 */
export const SCOOP_SUPPORT_WALLET =
  '44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27' as const;

/** Exact base58 match — never lowercase Solana addresses. */
export function isScoopSupportWallet(wallet: string | null | undefined): boolean {
  if (wallet == null) return false;
  return wallet.trim() === SCOOP_SUPPORT_WALLET;
}
