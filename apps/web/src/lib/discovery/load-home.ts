import { SCOOP_CHAIN_ID } from '@/lib/quotes/catalogue';
import {
  DISCOVER_TABS,
  type DiscoverTabId,
} from '@/lib/discovery/tabs';
import {
  getDiscoverBoard,
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

export type DiscoverSnapshot = {
  new: DiscoverTabResult;
  bonding: DiscoverTabResult;
  trending: DiscoverTabResult;
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

function toTabResult(
  tabId: DiscoverTabId,
  items: TokenDiscoveryItem[],
): DiscoverTabResult {
  const emptyMessage =
    DISCOVER_TABS.find((t) => t.id === tabId)?.emptyMessage ?? 'Nothing here yet.';
  if (items.length === 0) {
    return { tabId, status: 'empty', items: [], message: emptyMessage };
  }
  return { tabId, status: 'ok', items };
}

function errorTab(tabId: DiscoverTabId): DiscoverTabResult {
  return {
    tabId,
    status: 'error',
    items: [],
    message: 'Could not load markets. Try again.',
  };
}

/** SSR + API shared loader for all three Discover slices. */
export async function loadDiscoverSnapshot(): Promise<DiscoverSnapshot> {
  try {
    const board = await getDiscoverBoard(serverDb(), { chainId: SCOOP_CHAIN_ID });
    return {
      new: toTabResult('new', board.new),
      bonding: toTabResult('bonding', board.bonding),
      trending: toTabResult('trending', board.trending),
    };
  } catch (error) {
    console.error(
      '[discover] load failed:',
      error instanceof Error ? error.message : 'error',
    );
    return {
      new: errorTab('new'),
      bonding: errorTab('bonding'),
      trending: errorTab('trending'),
    };
  }
}

/** @deprecated Prefer loadDiscoverSnapshot — kept for market-activity helpers. */
export async function loadDiscoverTab(tabId: DiscoverTabId): Promise<DiscoverTabResult> {
  const snapshot = await loadDiscoverSnapshot();
  return snapshot[tabId === 'bonding' ? 'bonding' : tabId === 'trending' ? 'trending' : 'new'];
}

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
