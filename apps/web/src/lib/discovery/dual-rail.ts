import { SCOOP_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import type { TokenDiscoveryItem, DiscoverBoardRows, Queryable } from '@scoop/db';
import {
  applyPumpMarketStateToDiscoveryItems,
  DISCOVER_TAB_LIMIT,
  DISCOVER_TRENDING_MIN_TRADES_24H,
  getActiveMarkets,
  getDiscoverBoard,
} from '@scoop/db';
import { getSolUsdX18 } from '@/lib/market/spot';

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

function volumeUsdBigInt(item: TokenDiscoveryItem): bigint {
  try {
    return BigInt((item.volume24hUsdX18 ?? '0').trim() || '0');
  } catch {
    return BigInt(0);
  }
}

/**
 * Homepage TRENDING semantics (mirror getDiscoverTrending SQL):
 * trade_count_24h >= min AND volume_24h_usd_x18 > 0
 * Rank: volume USD DESC, trades DESC, buys DESC, address ASC
 */
export function rankDiscoverTrending(
  items: readonly TokenDiscoveryItem[],
  options?: { minTrades24h?: number; limit?: number },
): TokenDiscoveryItem[] {
  const minTrades = options?.minTrades24h ?? DISCOVER_TRENDING_MIN_TRADES_24H;
  const limit = options?.limit ?? DISCOVER_TAB_LIMIT;
  const eligible = items.filter((item) => {
    const trades = item.tradeCount24h ?? 0;
    if (!Number.isFinite(trades) || trades < minTrades) return false;
    return volumeUsdBigInt(item) > BigInt(0);
  });
  eligible.sort((a, b) => {
    const va = volumeUsdBigInt(a);
    const vb = volumeUsdBigInt(b);
    if (va !== vb) return va > vb ? -1 : 1;
    const ta = a.tradeCount24h ?? 0;
    const tb = b.tradeCount24h ?? 0;
    if (ta !== tb) return tb - ta;
    const ba = a.buyCount24h ?? 0;
    const bb = b.buyCount24h ?? 0;
    if (ba !== bb) return bb - ba;
    return a.tokenAddress.localeCompare(b.tokenAddress);
  });
  return eligible.slice(0, limit);
}

/**
 * Homepage Discover board across RHC + Solana/Pump.
 * NEW + Trending blend both chains; Bonding stays RHC-only (no Pump bonding state).
 */
export async function getDualRailDiscoverBoard(
  db: Queryable,
): Promise<DiscoverBoardRows> {
  const [rhc, solana, solUsdX18] = await Promise.all([
    getDiscoverBoard(db, { chainId: SCOOP_CHAIN_ID }),
    getDiscoverBoard(db, { chainId: SOLANA_MAINNET_CHAIN_ID }).catch(() => ({
      new: [] as TokenDiscoveryItem[],
      bonding: [] as TokenDiscoveryItem[],
      trending: [] as TokenDiscoveryItem[],
    })),
    getSolUsdX18(),
  ]);
  const mergedNew = await applyPumpMarketStateToDiscoveryItems(
    db,
    mergeDiscoveryByLaunchedAt(rhc.new, solana.new),
    solUsdX18,
  );
  // Solana trending SQL cannot see pump_market_state USD — rank in memory from overlay.
  const solanaForTrending = await applyPumpMarketStateToDiscoveryItems(
    db,
    mergeDiscoveryByLaunchedAt(solana.new, solana.trending),
    solUsdX18,
  );
  const trending = rankDiscoverTrending(
    mergeDiscoveryByLaunchedAt(rhc.trending, solanaForTrending),
  );
  return {
    new: mergedNew,
    bonding: rhc.bonding,
    trending,
  };
}

/** `/markets` active set: RHC + Pump/Solana launches with Pump SOL+USD overlay. */
export async function getDualRailActiveMarkets(
  db: Queryable,
): Promise<TokenDiscoveryItem[]> {
  const [rhc, solana, solUsdX18] = await Promise.all([
    getActiveMarkets(db, { chainId: SCOOP_CHAIN_ID }),
    getActiveMarkets(db, { chainId: SOLANA_MAINNET_CHAIN_ID }).catch(
      () => [] as TokenDiscoveryItem[],
    ),
    getSolUsdX18(),
  ]);
  const merged = mergeDiscoveryByLaunchedAt(rhc, solana);
  return applyPumpMarketStateToDiscoveryItems(db, merged, solUsdX18);
}
