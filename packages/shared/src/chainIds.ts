/**
 * Chain / launch-provider model (Gate E).
 *
 * chain_family  — network family on `chains` (`eip155` | `solana`)
 * chain_id      — product BIGINT PK key (4663 Robinhood; 900001 Solana mainnet sentinel)
 * market_source / launch_provider — how the market was created (`scoop` | `pons_v2` | `pump`)
 *
 * Do not invent fake EVM semantics for Solana. Do not reuse Robinhood 4663 for Pump.
 */

/** Robinhood Chain — existing product constant (CANONICAL_CHAIN_ID). */
export const ROBINHOOD_CHAIN_ID = 4663 as const;

/**
 * SCOOP product sentinel for Solana mainnet-beta.
 * Required because market tables PK on (chain_id, token_address).
 * Always pair with chain_family = 'solana' / market_source = 'pump'.
 */
export const SOLANA_MAINNET_CHAIN_ID = 900001 as const;

export type ScoopChainFamily = 'eip155' | 'solana';
export type ScoopLaunchChain = 'robinhood' | 'solana';
export type ScoopLaunchProvider = 'pons' | 'pump' | 'scoop';

/** Wrapped SOL mint — Pump SOL-pair quote identity (not an EVM zero address). */
export const SOLANA_WSOL_MINT =
  'So11111111111111111111111111111111111111112' as const;

/** Official Pump.fun program (create_v2). */
export const PUMP_PROGRAM_ID =
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' as const;

/** Pump Token-2022 create_v2 default supply (1e9 tokens × 10^6 decimals). */
export const PUMP_DEFAULT_TOTAL_SUPPLY_RAW = '1000000000000000' as const;
export const PUMP_TOKEN_DECIMALS = 6 as const;

export function isSolanaProductChainId(chainId: number): boolean {
  return chainId === SOLANA_MAINNET_CHAIN_ID;
}

export function isRobinhoodProductChainId(chainId: number): boolean {
  return chainId === ROBINHOOD_CHAIN_ID;
}

export function chainFamilyForChainId(chainId: number): ScoopChainFamily | null {
  if (chainId === ROBINHOOD_CHAIN_ID) return 'eip155';
  if (chainId === SOLANA_MAINNET_CHAIN_ID) return 'solana';
  return null;
}
