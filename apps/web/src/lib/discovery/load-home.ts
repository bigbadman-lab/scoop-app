import { SCOOP_CHAIN_ID } from '@/lib/quotes/catalogue';
import { DISCOVER_TABS, type DiscoverTabId } from '@/lib/discovery/tabs';
import {
  getTokens,
  serverDb,
  type DiscoveryFilter,
  type DiscoverySort,
  type TokenDiscoveryItem,
} from '@/lib/server/queries';

export type HomeDataStatus = 'ok' | 'empty' | 'unavailable' | 'error';

export type DiscoverTabResult = {
  tabId: DiscoverTabId;
  status: HomeDataStatus;
  items: TokenDiscoveryItem[];
  message?: string;
};

export type MarketActivityItem = {
  kind: 'new' | 'bonding';
  token: TokenDiscoveryItem;
};

export type MarketActivityResult = {
  status: HomeDataStatus;
  items: MarketActivityItem[];
  message?: string;
  /**
   * No unified cross-token activity feed exists yet.
   * This surface reuses discovery NEW + SOON rows only — not a fake trade ticker.
   * Future contract: GET /api/activity (launches + significant trades, ordered by time).
   */
  deferredUnifiedFeed: true;
};

async function safeGetTokens(
  filter: DiscoveryFilter,
  sort: DiscoverySort,
  limit: number,
): Promise<{ ok: true; items: TokenDiscoveryItem[] } | { ok: false; error: string }> {
  try {
    const items = await getTokens(serverDb(), {
      chainId: SCOOP_CHAIN_ID,
      filter,
      sort,
      limit,
    });
    return { ok: true, items };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load tokens',
    };
  }
}

export async function loadDiscoverTab(tabId: DiscoverTabId): Promise<DiscoverTabResult> {
  const tab = DISCOVER_TABS.find((t) => t.id === tabId) ?? DISCOVER_TABS[0]!;

  if (!tab.dataAvailable || !tab.filter || !tab.sort) {
    return {
      tabId: tab.id,
      status: 'unavailable',
      items: [],
      message: tab.emptyMessage,
    };
  }

  const result = await safeGetTokens(tab.filter, tab.sort, 24);
  if (!result.ok) {
    return {
      tabId: tab.id,
      status: 'error',
      items: [],
      message: 'Could not load markets. Try again.',
    };
  }
  if (result.items.length === 0) {
    return {
      tabId: tab.id,
      status: 'empty',
      items: [],
      message: tab.emptyMessage,
    };
  }
  return { tabId: tab.id, status: 'ok', items: result.items };
}

/** Lean market-activity column from real NEW + SOON discovery rows. */
export async function loadMarketActivity(): Promise<MarketActivityResult> {
  const [newResult, soonResult] = await Promise.all([
    safeGetTokens('new', 'newest', 4),
    safeGetTokens('soon', 'progress', 4),
  ]);

  if (!newResult.ok && !soonResult.ok) {
    return {
      status: 'error',
      items: [],
      message: 'Market activity unavailable.',
      deferredUnifiedFeed: true,
    };
  }

  const items: MarketActivityItem[] = [];
  if (newResult.ok) {
    for (const token of newResult.items.slice(0, 3)) {
      items.push({ kind: 'new', token });
    }
  }
  if (soonResult.ok) {
    for (const token of soonResult.items.slice(0, 3)) {
      items.push({ kind: 'bonding', token });
    }
  }

  if (items.length === 0) {
    return {
      status: 'empty',
      items: [],
      message: 'No live market activity yet.',
      deferredUnifiedFeed: true,
    };
  }

  return { status: 'ok', items, deferredUnifiedFeed: true };
}
