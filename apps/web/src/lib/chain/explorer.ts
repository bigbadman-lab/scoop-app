/**
 * Robinhood Chain explorer — single helper for tx / address links.
 * Keep in sync with `robinhoodAppKitChain.blockExplorers` in `lib/auth/chain.ts`
 * (avoid importing AppKit chain config into light UI modules).
 */
const ROBINHOOD_EXPLORER_BASE = 'https://explorer.mainnet.chain.robinhood.com';

export function robinhoodExplorerBaseUrl(): string {
  return ROBINHOOD_EXPLORER_BASE;
}

/** Transaction page on Robinhood Chain explorer. */
export function robinhoodTxUrl(txHash: string): string {
  const hash = txHash.trim();
  return `${ROBINHOOD_EXPLORER_BASE}/tx/${hash}`;
}
