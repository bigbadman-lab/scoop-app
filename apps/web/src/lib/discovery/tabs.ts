import type { DiscoveryFilter, DiscoverySort } from '@/lib/server/queries';

/**
 * Homepage DISCOVER tabs.
 *
 * NEW / BONDING use existing discovery filters.
 * TRENDING MVP ranks projected 24h activity (volume USD + trade count) — not an opaque score.
 */
export type DiscoverTabId = 'trending' | 'new' | 'bonding';

export type DiscoverTabConfig = {
  id: DiscoverTabId;
  label: string;
  /** When false, tab shows intentional empty UI — no fake ordering. */
  dataAvailable: boolean;
  filter?: DiscoveryFilter;
  sort?: DiscoverySort;
  emptyMessage: string;
};

export const DISCOVER_TABS: readonly DiscoverTabConfig[] = [
  {
    id: 'new',
    label: 'New',
    dataAvailable: true,
    filter: 'new',
    sort: 'newest',
    emptyMessage: 'No new markets yet.',
  },
  {
    id: 'bonding',
    label: 'Bonding',
    dataAvailable: true,
    filter: 'soon',
    sort: 'progress',
    emptyMessage: 'No bonding markets yet.',
  },
  {
    id: 'trending',
    label: 'Trending',
    dataAvailable: true,
    emptyMessage: 'No trending markets yet.',
  },
] as const;

export const DEFAULT_DISCOVER_TAB: DiscoverTabId = 'new';

/** Match token-page / markets live cadence (post-completion setTimeout). */
export const DISCOVER_LIVE_POLL_MS = 2000;

export function getDiscoverTab(id: string | null | undefined): DiscoverTabConfig {
  const found = DISCOVER_TABS.find((tab) => tab.id === id);
  return found ?? DISCOVER_TABS[0]!;
}
