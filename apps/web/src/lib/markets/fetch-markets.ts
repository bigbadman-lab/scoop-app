import { SCOOP_CHAIN_ID } from '@scoop/shared';
import type { MarketsBoardItem, MarketsBoardSnapshot } from '@/lib/markets/types';
import { rankMarketsByFdv } from '@/lib/markets/rank';

type MarketsApiBody = {
  items?: MarketsBoardItem[];
  error?: string;
};

/**
 * One HTTP request for the full active market set (client live refresh).
 * Returns `null` on transient failure so the poll keeps the last good snapshot.
 */
export async function fetchMarketsBoard(signal?: AbortSignal): Promise<MarketsBoardSnapshot | null> {
  try {
    const params = new URLSearchParams({
      chainId: String(SCOOP_CHAIN_ID),
    });
    const res = await fetch(`/api/markets?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as MarketsApiBody;
    if (!Array.isArray(body.items)) return null;

    const items = rankMarketsByFdv(body.items);
    if (items.length === 0) {
      return {
        status: 'empty',
        items: [],
        updatedAt: Date.now(),
        message: 'No active markets yet.',
      };
    }
    return { status: 'ok', items, updatedAt: Date.now() };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    return null;
  }
}
