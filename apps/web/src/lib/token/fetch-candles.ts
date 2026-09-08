import type { CandleItem } from '@scoop/db';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import {
  type ChartIntervalId,
  candleQueryForInterval,
} from '@/lib/token/chart-ranges';

export type FetchCandlesResult =
  | { ok: true; items: CandleItem[] }
  | { ok: false; error: string };

const cache = new Map<string, CandleItem[]>();

export function candleCacheKey(
  tokenAddress: string,
  interval: ChartIntervalId,
  nowBucketMin: number,
): string {
  return `${tokenAddress.toLowerCase()}:${interval}:${nowBucketMin}`;
}

export function clearCandleCache(): void {
  cache.clear();
}

/** Client fetch of indexed candles — no external providers. */
export async function fetchTokenCandles(args: {
  tokenAddress: string;
  /** Candle interval control (1m / 5m / …). */
  interval: ChartIntervalId;
  /** @deprecated alias for interval during transition */
  range?: ChartIntervalId;
  chainId?: number;
  nowSec?: number;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<FetchCandlesResult> {
  const interval = args.interval ?? args.range;
  if (!interval) {
    return { ok: false, error: 'Chart data unavailable' };
  }
  const chainId = args.chainId ?? SCOOP_CHAIN_ID;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const nowBucketMin = Math.floor(nowSec / 60);
  const key = candleCacheKey(args.tokenAddress, interval, nowBucketMin);

  if (!args.bypassCache && cache.has(key)) {
    return { ok: true, items: cache.get(key)! };
  }

  const q = candleQueryForInterval(interval, nowSec);
  const params = new URLSearchParams({
    chainId: String(chainId),
    interval: q.interval,
    limit: String(q.limit),
  });
  if (q.from != null) params.set('from', String(q.from));

  const url = `/api/tokens/${encodeURIComponent(args.tokenAddress)}/candles?${params}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: args.signal,
    });
    if (!res.ok) {
      return { ok: false, error: 'Chart data unavailable' };
    }
    const body = (await res.json()) as { items?: CandleItem[] };
    if (!Array.isArray(body.items)) {
      return { ok: false, error: 'Chart data unavailable' };
    }
    cache.set(key, body.items);
    return { ok: true, items: body.items };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'Chart data unavailable' };
  }
}
