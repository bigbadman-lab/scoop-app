import type { MarketsBoardItem } from '@/lib/markets/types';
import {
  compareMarketsByFdvDesc,
  marketAddressKey,
} from '@/lib/markets/rank';

export type MarketsSortId =
  | 'trending'
  | 'fdv'
  | 'newest'
  | 'trades'
  | 'holders';

export const MARKETS_SORT_OPTIONS = [
  { id: 'trending' as const, label: 'Trending' },
  { id: 'fdv' as const, label: 'FDV' },
  { id: 'newest' as const, label: 'Newest' },
  { id: 'trades' as const, label: 'Most traded' },
  { id: 'holders' as const, label: 'Holders' },
] as const;

export const DEFAULT_MARKETS_SORT: MarketsSortId = 'trending';

/** Board row with rank from the active discovery sort (not search position). */
export type RankedMarketsBoardItem = MarketsBoardItem & {
  /** 1-based rank within the current sort, before search filtering. */
  rank: number;
};

function holdersRankValue(item: MarketsBoardItem): number | null {
  const retail = item.holderCountRetail;
  if (retail != null && Number.isFinite(retail)) return retail;
  const all = item.holderCountAll;
  if (all != null && Number.isFinite(all)) return all;
  return null;
}

/**
 * Reorder only — never drops rows.
 * Null / missing metric values sort last but remain in the catalogue.
 */
export function sortMarketsBoardItems(
  items: readonly MarketsBoardItem[],
  sort: MarketsSortId,
): MarketsBoardItem[] {
  if (sort === 'trending') {
    // Preserve canonical SSR ranking (FDV desc via buildMarketsBoardItems).
    return items.slice();
  }

  const next = items.slice();
  if (sort === 'fdv') {
    next.sort(compareMarketsByFdvDesc);
    return next;
  }

  if (sort === 'newest') {
    next.sort((a, b) => {
      const byLaunch = b.launchedAt - a.launchedAt;
      if (byLaunch !== 0) return byLaunch;
      return marketAddressKey(a.tokenAddress).localeCompare(
        marketAddressKey(b.tokenAddress),
      );
    });
    return next;
  }

  if (sort === 'holders') {
    next.sort((a, b) => {
      const aH = holdersRankValue(a);
      const bH = holdersRankValue(b);
      const aMissing = aH == null;
      const bMissing = bH == null;
      if (aMissing && bMissing) {
        return marketAddressKey(a.tokenAddress).localeCompare(
          marketAddressKey(b.tokenAddress),
        );
      }
      if (aMissing) return 1;
      if (bMissing) return -1;
      const byHolders = (bH as number) - (aH as number);
      if (byHolders !== 0) return byHolders;
      return marketAddressKey(a.tokenAddress).localeCompare(
        marketAddressKey(b.tokenAddress),
      );
    });
    return next;
  }

  // Most traded — lifetime trade count; missing values sort last.
  next.sort((a, b) => {
    const aTrades = a.tradeCountAllTime;
    const bTrades = b.tradeCountAllTime;
    const aMissing = aTrades == null || !Number.isFinite(aTrades);
    const bMissing = bTrades == null || !Number.isFinite(bTrades);
    if (aMissing && bMissing) {
      return marketAddressKey(a.tokenAddress).localeCompare(
        marketAddressKey(b.tokenAddress),
      );
    }
    if (aMissing) return 1;
    if (bMissing) return -1;
    const byTrades = (bTrades as number) - (aTrades as number);
    if (byTrades !== 0) return byTrades;
    return marketAddressKey(a.tokenAddress).localeCompare(
      marketAddressKey(b.tokenAddress),
    );
  });
  return next;
}

export function withMarketsRanks(
  items: readonly MarketsBoardItem[],
): RankedMarketsBoardItem[] {
  return items.map((item, index) => ({ ...item, rank: index + 1 }));
}

/** Case-insensitive name / ticker / quote filter. Empty query → all items. */
export function filterMarketsBoardItems<T extends MarketsBoardItem>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice();

  return items.filter((item) => {
    const name = item.name.toLowerCase();
    const symbol = item.symbol.toLowerCase();
    const quote = item.quoteSymbol.toLowerCase();
    return name.includes(q) || symbol.includes(q) || quote.includes(q);
  });
}

/**
 * Sort for the active view, assign canonical ranks, then optionally filter.
 * Search preserves each market's view rank (does not renumber).
 * Sort never removes rows — only search does.
 */
export function applyMarketsBoardView(
  items: readonly MarketsBoardItem[],
  args: { sort: MarketsSortId; query: string },
): RankedMarketsBoardItem[] {
  const ranked = withMarketsRanks(sortMarketsBoardItems(items, args.sort));
  return filterMarketsBoardItems(ranked, args.query);
}

/** #1 token address for the active sort (ignores search). */
export function marketsViewLeaderId(
  items: readonly MarketsBoardItem[],
  sort: MarketsSortId,
): string | null {
  const sorted = sortMarketsBoardItems(items, sort);
  return sorted[0]?.tokenAddress ?? null;
}

/** Compact feed freshness label from last successful poll timestamp. */
export function formatMarketsFeedUpdatedAt(
  updatedAtMs: number | null,
  nowMs: number,
  health: 'live' | 'stale',
): string {
  if (updatedAtMs == null || !Number.isFinite(updatedAtMs)) {
    return health === 'stale' ? 'Last updated —' : 'Updated —';
  }
  const ageSec = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  if (health === 'stale') {
    return ageSec <= 0 ? 'Last updated now' : `Last updated ${ageSec}s ago`;
  }
  if (ageSec <= 0) return 'Updated now';
  return `Updated ${ageSec}s ago`;
}
