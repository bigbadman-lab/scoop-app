import {
  getDraftSelectedDisplayImagePath,
  upsertTokenDisplayFinalizeIntent,
  type Queryable,
} from '@scoop/db';
import { isAllowedTokenDisplayImagePath, isUuid } from '@scoop/news';

export type RecordDisplayFinalizeIntentInput = {
  db: Queryable;
  imageUri: string;
  draftId?: string | null;
  displayImagePath?: string | null;
  chainId?: number | null;
  tokenAddress?: string | null;
};

/**
 * Persist a server-owned finalize intent at pin (or post-receipt) time.
 * Enrich display path from selected draft artwork when missing.
 */
export async function recordDisplayFinalizeIntent(
  input: RecordDisplayFinalizeIntentInput,
): Promise<{ ok: true; intentId: string | null } | { ok: false; error: string }> {
  const imageUri = input.imageUri.trim();
  if (!/^ipfs:\/\//i.test(imageUri)) {
    return { ok: false, error: 'imageUri must be an ipfs:// URI' };
  }

  let path =
    input.displayImagePath?.trim().replace(/^\/+/, '') || '';
  if (path && !isAllowedTokenDisplayImagePath(path)) {
    return { ok: false, error: 'invalid_display_path' };
  }

  const draftId = input.draftId?.trim() || '';
  if (draftId && !isUuid(draftId)) {
    return { ok: false, error: 'invalid_draft_id' };
  }

  if (!path && draftId) {
    path = (await getDraftSelectedDisplayImagePath(input.db, draftId)) ?? '';
  }

  try {
    const intent = await upsertTokenDisplayFinalizeIntent(input.db, {
      imageUri,
      draftId: draftId || null,
      displayImagePath: path || null,
      chainId: input.chainId ?? null,
      tokenAddress: input.tokenAddress ?? null,
    });
    console.info(
      '[token-display-finalize]',
      JSON.stringify({
        event: 'intent_recorded',
        owner: 'pin_enqueue',
        intentId: intent?.id ?? null,
        status: intent?.status ?? null,
        hasPath: Boolean(path),
        hasDraft: Boolean(draftId),
        hasToken: Boolean(input.tokenAddress),
      }),
    );
    return { ok: true, intentId: intent?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'intent_failed';
    console.warn('[token-display-finalize]', JSON.stringify({
      event: 'intent_record_failed',
      owner: 'pin_enqueue',
      error: message,
    }));
    return { ok: false, error: message };
  }
}
