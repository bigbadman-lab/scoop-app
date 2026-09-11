import type { DiscoverSnapshot, DiscoverTabResult } from '@/lib/discovery/load-home';
import { DISCOVER_TABS, type DiscoverTabId } from '@/lib/discovery/tabs';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import { SCOOP_CHAIN_ID } from '@scoop/shared';

type DiscoverApiBody = {
  new?: TokenDiscoveryItem[];
  bonding?: TokenDiscoveryItem[];
  trending?: TokenDiscoveryItem[];
};

function toTabResult(tabId: DiscoverTabId, items: TokenDiscoveryItem[]): DiscoverTabResult {
  const emptyMessage =
    DISCOVER_TABS.find((t) => t.id === tabId)?.emptyMessage ?? 'Nothing here yet.';
  if (items.length === 0) {
    return { tabId, status: 'empty', items: [], message: emptyMessage };
  }
  return { tabId, status: 'ok', items };
}

/**
 * One HTTP request for all Discover tabs.
 * Returns `null` on transient failure so the poll keeps the last good snapshot.
 */
export async function fetchDiscoverSnapshot(
  signal?: AbortSignal,
): Promise<DiscoverSnapshot | null> {
  try {
    const params = new URLSearchParams({
      chainId: String(SCOOP_CHAIN_ID),
    });
    const res = await fetch(`/api/discover?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DiscoverApiBody;
    if (
      !Array.isArray(body.new) ||
      !Array.isArray(body.bonding) ||
      !Array.isArray(body.trending)
    ) {
      return null;
    }
    return {
      new: toTabResult('new', body.new),
      bonding: toTabResult('bonding', body.bonding),
      trending: toTabResult('trending', body.trending),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    return null;
  }
}
