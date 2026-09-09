import type { TradeItem } from '@scoop/db';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { TRADES_CHART_SEED_LIMIT } from '@/lib/token/chart-ranges';

export type FetchTradesResult =
  | { ok: true; items: TradeItem[] }
  | { ok: false; error: string };

const cache = new Map<string, TradeItem[]>();

export function tradeCacheKey(
  tokenAddress: string,
  limit: number,
  nowBucketSec: number,
): string {
  return `${tokenAddress.toLowerCase()}:trades:${limit}:${nowBucketSec}`;
}

export function clearTradeCache(): void {
  cache.clear();
}

/** Client fetch of indexed trades — newest-first from API. No external providers. */
export async function fetchTokenTrades(args: {
  tokenAddress: string;
  chainId?: number;
  limit?: number;
  nowSec?: number;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<FetchTradesResult> {
  const chainId = args.chainId ?? SCOOP_CHAIN_ID;
  const limit = Math.min(args.limit ?? TRADES_CHART_SEED_LIMIT, TRADES_CHART_SEED_LIMIT);
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  // 5s cache bucket — fine for static seed; live layer will bypass later.
  const key = tradeCacheKey(args.tokenAddress, limit, Math.floor(nowSec / 5));

  if (!args.bypassCache && cache.has(key)) {
    return { ok: true, items: cache.get(key)! };
  }

  const params = new URLSearchParams({
    chainId: String(chainId),
    limit: String(limit),
  });
  const url = `/api/tokens/${encodeURIComponent(args.tokenAddress)}/trades?${params}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: args.signal,
    });
    if (!res.ok) {
      return { ok: false, error: 'Trades unavailable' };
    }
    const body = (await res.json()) as { items?: TradeItem[] };
    if (!Array.isArray(body.items)) {
      return { ok: false, error: 'Trades unavailable' };
    }
    cache.set(key, body.items);
    return { ok: true, items: body.items };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'Trades unavailable' };
  }
}
