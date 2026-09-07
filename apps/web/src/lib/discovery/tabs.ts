import type { DiscoveryFilter, DiscoverySort } from '@/lib/server/queries';

/**
 * Homepage DISCOVER tabs.
 *
 * Trending ranking is not yet defined — do not map it to volume/trades and
 * present that as Trending. Other tabs reuse existing discovery filters.
 *
 * Future Trending contract (deferred):
 *   GET /api/rankings?type=<trending>  OR  dedicated trending score field
 *   Ranking logic TBD — do not invent until product defines it.
 */
export type DiscoverTabId = 'trending' | 'new' | 'bonding' | 'bonded';

export type DiscoverTabConfig = {
  id: DiscoverTabId;
  label: string;
  /** When false, tab shows intentional deferred/empty UI — no fake ordering. */
  dataAvailable: boolean;
  filter?: DiscoveryFilter;
  sort?: DiscoverySort;
  emptyMessage: string;
};

export const DISCOVER_TABS: readonly DiscoverTabConfig[] = [
  {
    id: 'trending',
    label: 'Trending',
    dataAvailable: false,
    emptyMessage: 'Trending ranking is not available yet.',
  },
  {
    id: 'new',
    label: 'New',
    dataAvailable: true,
    filter: 'new',
    sort: 'newest',
    emptyMessage: 'Nothing new yet.',
  },
  {
    id: 'bonding',
    label: 'Bonding',
    dataAvailable: true,
    filter: 'soon',
    sort: 'progress',
    emptyMessage: 'No markets are bonding right now.',
  },
  {
    id: 'bonded',
    label: 'Bonded',
    dataAvailable: true,
    filter: 'bonded',
    sort: 'newest',
    emptyMessage: 'No bonded markets yet.',
  },
] as const;

export const DEFAULT_DISCOVER_TAB: DiscoverTabId = 'trending';

export function getDiscoverTab(id: string | null | undefined): DiscoverTabConfig {
  const found = DISCOVER_TABS.find((tab) => tab.id === id);
  return found ?? DISCOVER_TABS[0]!;
}
