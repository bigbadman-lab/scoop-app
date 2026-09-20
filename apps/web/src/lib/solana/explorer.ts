/** Provider-aware Solana / Pump link helpers — do not alter Robinhood explorers. */

const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com';
const PUMP_FUN_BASE = 'https://pump.fun';

export function solanaExplorerTxUrl(signature: string): string {
  const sig = signature.trim();
  return `${SOLANA_EXPLORER_BASE}/tx/${encodeURIComponent(sig)}?cluster=mainnet`;
}

export function solanaExplorerAddressUrl(address: string): string {
  const addr = address.trim();
  return `${SOLANA_EXPLORER_BASE}/address/${encodeURIComponent(addr)}?cluster=mainnet`;
}

/** Pump.fun coin page — mint is the public coin id on mainnet. */
export function pumpFunCoinUrl(mint: string): string {
  const m = mint.trim();
  return `${PUMP_FUN_BASE}/coin/${encodeURIComponent(m)}`;
}
