/**
 * After receipt, persist durable news↔market intent (and link if indexed).
 * Safe to call repeatedly. Browser abort must not cancel the request once fired.
 */
export async function activateNewsArticleMarket(args: {
  chainId: number;
  tokenAddress: string;
  providerArticleId?: string | null;
  draftId?: string | null;
  /** Ignored for durability — kept for call-site compatibility. */
  signal?: AbortSignal;
  honorAbort?: boolean;
}): Promise<{ ok: boolean; linked?: boolean; pending?: boolean; error?: string }> {
  const providerArticleId = args.providerArticleId?.trim() || '';
  const draftId = args.draftId?.trim() || '';
  if (!providerArticleId && !draftId) {
    return { ok: false, error: 'no_provenance' };
  }

  try {
    const res = await fetch('/api/news/article-markets', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      cache: 'no-store',
      // Durability: do not attach AbortSignal unless explicitly requested.
      signal: args.honorAbort ? args.signal : undefined,
      // Survive soft navigations long enough for the server to persist the intent.
      keepalive: true,
      body: JSON.stringify({
        chainId: args.chainId,
        tokenAddress: args.tokenAddress,
        providerArticleId: providerArticleId || undefined,
        draftId: draftId || undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      linked?: boolean;
      pending?: boolean;
      error?: string;
    } | null;
    if (!res.ok) {
      return { ok: false, error: body?.error ?? `http_${res.status}` };
    }
    return {
      ok: true,
      linked: Boolean(body?.linked),
      pending: Boolean(body?.pending),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'network' };
  }
}
