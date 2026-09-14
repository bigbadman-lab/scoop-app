/**
 * Client helper: trigger durable server-side display_image_url finalization.
 * Prefer manual displayImagePath over draft; always pass imageUri for IPFS fallback.
 * Correctness is owned by the server (wait-for-index + path/draft/IPFS mirror).
 */
export type EnsureDisplayImageInput = {
  chainId: number;
  tokenAddress: string;
  /** Manual path from pin — wins over draft when present. */
  displayImagePath?: string | null;
  /** News/AI draft — used only when displayImagePath is absent. */
  sourceDraftId?: string | null;
  /** Canonical ipfs:// URI for server-side Supabase mirror fallback. */
  imageUri?: string | null;
  /** Server polls until token row exists (default true). */
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
  try {
    const res = await fetchFn('/api/launch/display-image', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      // Durable: do not cancel server work when completion AbortSignal fires,
      // unless caller explicitly opts in.
      signal: input.honorAbort ? input.signal : undefined,
      body: JSON.stringify({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        displayImagePath: path || undefined,
        draftId: path ? undefined : draftId || undefined,
        imageUri: imageUri || undefined,
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
