/**
 * After an indexed launch is known, link news provenance → MARKET LIVE.
 * Safe to call repeatedly (idempotent). No-ops without article id.
 */
export async function activateNewsArticleMarket(args: {
  chainId: number;
  tokenAddress: string;
  providerArticleId?: string | null;
  draftId?: string | null;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; error?: string }> {
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
      signal: args.signal,
      body: JSON.stringify({
        chainId: args.chainId,
        tokenAddress: args.tokenAddress,
        providerArticleId: providerArticleId || undefined,
        draftId: draftId || undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'network' };
  }
}
