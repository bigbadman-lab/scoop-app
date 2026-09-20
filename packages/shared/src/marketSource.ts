/**
 * Market source discriminator (Gate 6 / Gate E).
 * Explicit column preferred over fragile factory-address comparisons.
 *
 * Meaning:
 * - scoop   — ScoopFactory UV4-at-launch on Robinhood
 * - pons_v2 — Pons bonding curve on Robinhood
 * - pump    — Pump.fun create_v2 on Solana
 *
 * Distinct from chain_id / chain_family (network identity).
 */
export const MARKET_SOURCES = ['scoop', 'pons_v2', 'pump'] as const;
export type MarketSource = (typeof MARKET_SOURCES)[number];

export const MARKET_PHASES = ['curve', 'graduated_pool'] as const;
export type MarketPhase = (typeof MARKET_PHASES)[number];

export function isMarketSource(value: unknown): value is MarketSource {
  return value === 'scoop' || value === 'pons_v2' || value === 'pump';
}

export function normalizeMarketSource(value: unknown): MarketSource {
  if (value === 'pons_v2') return 'pons_v2';
  if (value === 'pump') return 'pump';
  return 'scoop';
}

/** Map DB graduation_status → public marketPhase. */
export function marketPhaseFromGraduationStatus(
  source: MarketSource,
  graduationStatus: string | null | undefined,
): MarketPhase | null {
  if (source !== 'pons_v2') return null;
  if (graduationStatus === 'graduated') return 'graduated_pool';
  return 'curve';
}

/**
 * Synthetic bytes32 pool id from a curve address for trade/market_state FK reuse.
 * Not a Uniswap v4 PoolId — readers must gate on market_source.
 */
export function curveSyntheticPoolId(curveAddress: string): `0x${string}` {
  const hex = curveAddress.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error(`Invalid curve address for synthetic pool id: ${curveAddress}`);
  }
  return `0x${hex.padStart(64, '0')}` as `0x${string}`;
}

/** creator_id for wallet deployers (Pons) — left-padded address bytes32. */
export function creatorIdFromWallet(deployer: string): `0x${string}` {
  const hex = deployer.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error(`Invalid deployer for creator id: ${deployer}`);
  }
  return `0x${hex.padStart(64, '0')}` as `0x${string}`;
}
