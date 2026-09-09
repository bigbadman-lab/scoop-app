import type { TokenDetail } from '@scoop/db';
import { SCOOP_CHAIN_ID } from '@scoop/shared';

export type FetchTokenDetailResult =
  | { ok: true; token: TokenDetail }
  | { ok: false; error: string };

/** Client fetch of canonical indexed token detail — no-store, never optimistic. */
export async function fetchTokenDetail(args: {
  tokenAddress: string;
  chainId?: number;
  signal?: AbortSignal;
}): Promise<FetchTokenDetailResult> {
  const chainId = args.chainId ?? SCOOP_CHAIN_ID;
  const params = new URLSearchParams({ chainId: String(chainId) });
  const url = `/api/tokens/${encodeURIComponent(args.tokenAddress)}?${params}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: args.signal,
    });
    if (!res.ok) {
      return { ok: false, error: res.status === 404 ? 'Token not found' : 'Token unavailable' };
    }
    const body = (await res.json()) as { token?: TokenDetail };
    if (!body.token || typeof body.token !== 'object') {
      return { ok: false, error: 'Token unavailable' };
    }
    return { ok: true, token: body.token };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'Token unavailable' };
  }
}
