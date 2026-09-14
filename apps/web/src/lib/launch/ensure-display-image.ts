/**
 * Client helper: receipt-driven server bind of the trusted finalize intent.
 * Returns the durable Supabase public display URL immediately — does not wait
 * for canonical indexing. Browser never writes tokens.display_image_url.
 */
export type EnsureDisplayImageInput = {
  chainId: number;
  tokenAddress: string;
  /** Manual path from pin — hint; server prefers intent path. */
  displayImagePath?: string | null;
  /** News/AI draft — used only when displayImagePath is absent. */
  sourceDraftId?: string | null;
  /** Canonical ipfs:// URI — required trusted match key for bind. */
  imageUri?: string | null;
  /**
   * @deprecated Bind no longer waits for index; retained for call-site compat.
   */
  waitForIndex?: boolean;
  /**
   * When false, do not abort the in-flight request if signal fires
   * (used so tab close / completion abort does not cancel durable work).
   * Default: ignore AbortSignal for the fetch (durable).
   */
  honorAbort?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type EnsureDisplayImageResult =
  | {
      ok: true;
      status: 'applied' | 'skipped' | 'noop';
      source?: string;
      uploaded?: boolean;
      displayImageUrl?: string;
      finalized?: boolean;
    }
  | { ok: false; error: string };

export async function ensureTokenDisplayImage(
  input: EnsureDisplayImageInput,
): Promise<EnsureDisplayImageResult> {
  const path = input.displayImagePath?.trim() || '';
  const draftId = input.sourceDraftId?.trim() || '';
  const imageUri = input.imageUri?.trim() || '';
  if (!path && !draftId && !imageUri) {
    return { ok: true, status: 'noop' };
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const signal = input.honorAbort ? input.signal : undefined;

  // Normal path: receipt bind by trusted image_uri (no wait-for-index).
  if (imageUri) {
    try {
      const res = await fetchFn('/api/launch/display-image/bind', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal,
        keepalive: true,
        body: JSON.stringify({
          chainId: input.chainId,
          tokenAddress: input.tokenAddress,
          displayImagePath: path || undefined,
          // Always forward draftId when known (news dual-write on server).
          draftId: draftId || undefined,
          imageUri,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        displayImageUrl?: string;
        finalized?: boolean;
        source?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        return { ok: false, error: body?.error ?? `http_${res.status}` };
      }
      return {
        ok: true,
        status: body.finalized ? 'applied' : 'skipped',
        source: body.source,
        displayImageUrl: body.displayImageUrl,
        finalized: body.finalized,
        uploaded: false,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, error: 'aborted' };
      }
      return { ok: false, error: 'network' };
    }
  }

  // Legacy fallback when imageUri is absent (path/draft only).
  try {
    const res = await fetchFn('/api/launch/display-image', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      signal,
      body: JSON.stringify({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        displayImagePath: path || undefined,
        draftId: path ? undefined : draftId || undefined,
        waitForIndex: input.waitForIndex !== false,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      status?: 'applied' | 'skipped' | 'noop';
      source?: string;
      uploaded?: boolean;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `http_${res.status}` };
    }
    return {
      ok: true,
      status: body.status ?? 'applied',
      source: body.source,
      uploaded: body.uploaded,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'network' };
  }
}
