/**
 * Locked Gate 2 Pons V2 constants (Robinhood Chain).
 * Canonical copy also lives in packages/contracts/src/manifests/pons-v2-production.json.
 */

/** Robinhood Chain. */
export const PONS_V2_CHAIN_ID = 4663 as const;

export const PONS_V2_FACTORY =
  '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e' as `0x${string}`;

export const PONS_V2_LAUNCH_AND_BUY =
  '0xe33e9e479df8802cb0866d5d05258bec4cf62948' as `0x${string}`;

/** First SCOOP migration: config 0 only. */
export const PONS_LAUNCH_CONFIG_ID = BigInt(0);

/** Native ETH pair (zero address). Do not use approvedPairTokens for this. */
export const PONS_NATIVE_PAIR_TOKEN =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;

/**
 * Named default slippage for Pons dev-buy simulation (Gate 3).
 * Not wired into public UI yet.
 */
export const PONS_DEV_BUY_SLIPPAGE_BPS = 100 as const;

/** Permissive probe min-out so simulation can report expected tokensOut. */
export const PONS_PROBE_MIN_TOKENS_OUT = BigInt(1);
