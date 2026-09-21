import { SCOOP_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import type { TokenDiscoveryItem, DiscoverBoardRows, Queryable } from '@scoop/db';
import { getActiveMarkets, getDiscoverBoard } from '@scoop/db';

/** Merge discovery NEW slices by launchedAt desc; RHC + Pump, base58-safe. */
export function mergeDiscoveryByLaunchedAt(
  ...lists: readonly (readonly TokenDiscoveryItem[])[]
): TokenDiscoveryItem[] {
  const byKey = new Map<string, TokenDiscoveryItem>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.chainId}:${item.tokenAddress}`;
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.launchedAt !== b.launchedAt) return b.launchedAt - a.launchedAt;
    return a.tokenAddress.localeCompare(b.tokenAddress);
  });
}

/**
 * Homepage Discover board across RHC + Solana/Pump.
 * Bonding/trending stay RHC-only until Pump market-state exists.
 * NEW includes Pump launches even when TMS is absent.
 */
export async function getDualRailDiscoverBoard(
  db: Queryable,
): Promise<DiscoverBoardRows> {
  const [rhc, solana] = await Promise.all([
    getDiscoverBoard(db, { chainId: SCOOP_CHAIN_ID }),
    getDiscoverBoard(db, { chainId: SOLANA_MAINNET_CHAIN_ID }).catch(() => ({
      new: [] as TokenDiscoveryItem[],
      bonding: [] as TokenDiscoveryItem[],
      trending: [] as TokenDiscoveryItem[],
    })),
  ]);
  return {
    new: mergeDiscoveryByLaunchedAt(rhc.new, solana.new),
    bonding: rhc.bonding,
    trending: rhc.trending,
  };
}

/** `/markets` active set: RHC + Pump/Solana launches. */
export async function getDualRailActiveMarkets(
  db: Queryable,
): Promise<TokenDiscoveryItem[]> {
  const [rhc, solana] = await Promise.all([
    getActiveMarkets(db, { chainId: SCOOP_CHAIN_ID }),
    getActiveMarkets(db, { chainId: SOLANA_MAINNET_CHAIN_ID }).catch(
      () => [] as TokenDiscoveryItem[],
    ),
  ]);
  return mergeDiscoveryByLaunchedAt(rhc, solana);
}
