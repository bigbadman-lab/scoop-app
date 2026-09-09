/**
 * Client helper: finalize SCOOP display_image_url after canonical index.
 * Prefer manual displayImagePath (same bytes as IPFS pin) over draft AI artwork.
 */
export type EnsureDisplayImageInput = {
  chainId: number;
  tokenAddress: string;
  /** Manual path from pin — wins over draft when present. */
  displayImagePath?: string | null;
  /** News/AI draft — used only when displayImagePath is absent. */
  sourceDraftId?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type EnsureDisplayImageResult =
  | { ok: true; status: 'applied' | 'skipped' | 'noop' }
  | { ok: false; error: string };

export async function ensureTokenDisplayImage(
  input: EnsureDisplayImageInput,
): Promise<EnsureDisplayImageResult> {
  const path = input.displayImagePath?.trim() || '';
  const draftId = input.sourceDraftId?.trim() || '';
  if (!path && !draftId) {
    return { ok: true, status: 'noop' };
  }

  const fetchFn = input.fetchImpl ?? fetch;
  try {
    const res = await fetchFn('/api/launch/display-image', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      signal: input.signal,
      body: JSON.stringify({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        // Manual path wins: omit draft when path present so AI cannot overwrite.
        displayImagePath: path || undefined,
        draftId: path ? undefined : draftId || undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      status?: 'applied' | 'skipped' | 'noop';
      error?: string;
    } | null;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `http_${res.status}` };
    }
    return { ok: true, status: body.status ?? 'applied' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    return { ok: false, error: 'network' };
  }
}
