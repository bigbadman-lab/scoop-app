/** Provider-aware Solana / Pump link helpers — do not alter Robinhood explorers. */

const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com';
const PUMP_FUN_BASE = 'https://pump.fun';
const AXIOM_TRADE_BASE = 'https://axiom.trade';
const GMGN_BASE = 'https://gmgn.ai';

export function solanaExplorerTxUrl(signature: string): string {
  const sig = signature.trim();
  return `${SOLANA_EXPLORER_BASE}/tx/${encodeURIComponent(sig)}?cluster=mainnet`;
}

export function solanaExplorerAddressUrl(address: string): string {
  const addr = address.trim();
  return `${SOLANA_EXPLORER_BASE}/address/${encodeURIComponent(addr)}?cluster=mainnet`;
}

/** Pump.fun coin page — mint is the public coin id on mainnet. Launch venue / source only. */
export function pumpFunCoinUrl(mint: string): string {
  const m = mint.trim();
  return `${PUMP_FUN_BASE}/coin/${encodeURIComponent(m)}`;
}

/** Axiom Solana terminal — mint deep-link (`/t/{mint}`). */
export function axiomTradeUrl(mint: string): string {
  const m = mint.trim();
  return `${AXIOM_TRADE_BASE}/t/${encodeURIComponent(m)}`;
}

/** GMGN Solana terminal — mint deep-link (`/sol/token/{mint}`). */
export function gmgnTradeUrl(mint: string): string {
  const m = mint.trim();
  return `${GMGN_BASE}/sol/token/${encodeURIComponent(m)}`;
}
