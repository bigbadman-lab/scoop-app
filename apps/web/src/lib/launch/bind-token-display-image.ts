import {
  bindDisplayFinalizeIntentToToken,
  ensureNewsArticleMarketFromTrustedDraft,
  getDraftSelectedDisplayImagePath,
  getTokenImageFields,
  markDisplayFinalizeIntentResult,
  setTokenDisplayImageUrl,
  type Queryable,
} from '@scoop/db';

async function ensureNewsFromBoundDraft(args: {
  db: Queryable;
  chainId: number;
  tokenAddress: string;
  draftId: string | null;
  log: (fields: Record<string, unknown>) => void;
}): Promise<void> {
  try {
    const news = await ensureNewsArticleMarketFromTrustedDraft(args.db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      draftId: args.draftId,
    });
    if (!news.ok) {
      args.log({
        event: 'news_ensure_skipped',
        tokenAddress: args.tokenAddress,
        reason: news.reason,
      });
    }
  } catch (error) {
    args.log({
      event: 'news_ensure_failed',
      tokenAddress: args.tokenAddress,
      error: error instanceof Error ? error.message : 'error',
    });
  }
}
import {
  deriveTokenImagePublicUrl,
  isAllowedTokenDisplayImagePath,
} from '@scoop/news';

export type BindTokenDisplayImageInput = {
  db: Queryable;
  chainId: number;
  tokenAddress: string;
  /** Required trusted match key — must be ipfs:// */
  imageUri: string;
  draftId?: string | null;
  /** Client hint only; server prefers intent path when present. */
  displayImagePath?: string | null;
  supabaseOrigin?: string;
  log?: (fields: Record<string, unknown>) => void;
};

export type BindTokenDisplayImageResult =
  | {
      ok: true;
      displayImageUrl: string;
      bound: true;
      finalized: boolean;
      intentId: string | null;
      /** Trusted draft on the bound intent, when present. */
      draftId: string | null;
      source: 'path' | 'draft' | 'existing';
      tokenRowPresent: boolean;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      code:
        | 'INVALID_IMAGE_URI'
        | 'INTENT_NOT_FOUND'
        | 'PATH_MISSING'
        | 'INVALID_PATH'
        | 'STORAGE_NOT_CONFIGURED'
        | 'DB_ERROR';
    };

function defaultLog(fields: Record<string, unknown>): void {
  console.info('[token-display-bind]', JSON.stringify(fields));
}

/**
 * Receipt-driven bind + best-effort canonical finalize.
 *
 * Phase A (always): bind trusted finalize intent to token address; resolve
 * public Supabase URL from intent path (never from client URL).
 * Phase B (if tokens row exists): write tokens.display_image_url and mark done.
 *
 * Does not fail merely because the token row is not indexed yet.
 */
export async function bindAndFinalizeTokenDisplayImage(
  input: BindTokenDisplayImageInput,
): Promise<BindTokenDisplayImageResult> {
  const log = input.log ?? defaultLog;
  const imageUri = input.imageUri.trim();
  const tokenAddress = input.tokenAddress.trim();

  if (!/^ipfs:\/\//i.test(imageUri)) {
    return {
      ok: false,
      error: 'imageUri must be an ipfs:// URI',
      retryable: false,
      code: 'INVALID_IMAGE_URI',
    };
  }

  const clientPath =
    input.displayImagePath?.trim().replace(/^\/+/, '') || '';
  if (clientPath && !isAllowedTokenDisplayImagePath(clientPath)) {
    return {
      ok: false,
      error: 'invalid_display_path',
      retryable: false,
      code: 'INVALID_PATH',
    };
  }

  const draftId = input.draftId?.trim() || '';

  let intent;
  try {
    intent = await bindDisplayFinalizeIntentToToken(input.db, {
      chainId: input.chainId,
      tokenAddress,
      imageUri,
      draftId: draftId || null,
      displayImagePath: clientPath || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bind_failed';
    log({
      event: 'bind_failed',
      tokenAddress,
      imageUriMatched: true,
      error: message,
    });
    return {
      ok: false,
      error: message,
      retryable: true,
      code: 'DB_ERROR',
    };
  }

  if (!intent) {
    log({
      event: 'intent_not_found',
      tokenAddress,
      imageUriMatched: false,
      displayPathFound: false,
      bindResult: 'failed',
    });
    return {
      ok: false,
      error: 'finalize_intent_not_found',
      retryable: true,
      code: 'INTENT_NOT_FOUND',
    };
  }

  let path = intent.displayImagePath?.trim().replace(/^\/+/, '') || '';
  if (!path && intent.draftId) {
    path =
      (await getDraftSelectedDisplayImagePath(input.db, intent.draftId)) ?? '';
  }
  if (!path && clientPath) {
    path = clientPath;
  }

  const fields = await getTokenImageFields(input.db, {
    chainId: input.chainId,
    tokenAddress,
  });
  const tokenRowPresent = Boolean(fields);
  const resolvedDraftId = intent.draftId?.trim() || null;

  if (fields?.displayImageUrl && /^https:\/\//i.test(fields.displayImageUrl)) {
    if (intent.status !== 'done') {
      await markDisplayFinalizeIntentResult(input.db, {
        id: intent.id,
        status: 'done',
      });
    }
    await ensureNewsFromBoundDraft({
      db: input.db,
      chainId: input.chainId,
      tokenAddress,
      draftId: resolvedDraftId,
      log,
    });
    log({
      event: 'already_finalized',
      tokenAddress,
      intentId: intent.id,
      intentFound: true,
      imageUriMatched: true,
      displayPathFound: Boolean(path),
      bindResult: 'ok',
      canonicalRowPresent: true,
      finalized: true,
      source: 'existing',
    });
    return {
      ok: true,
      displayImageUrl: fields.displayImageUrl,
      bound: true,
      finalized: true,
      intentId: intent.id,
      draftId: resolvedDraftId,
      source: 'existing',
      tokenRowPresent: true,
    };
  }

  if (!path) {
    log({
      event: 'path_missing',
      tokenAddress,
      intentId: intent.id,
      intentFound: true,
      imageUriMatched: true,
      displayPathFound: false,
      bindResult: 'ok',
      canonicalRowPresent: tokenRowPresent,
      finalized: false,
    });
    return {
      ok: false,
      error: 'display_path_missing',
      retryable: true,
      code: 'PATH_MISSING',
    };
  }

  if (!isAllowedTokenDisplayImagePath(path)) {
    return {
      ok: false,
      error: 'invalid_display_path',
      retryable: false,
      code: 'INVALID_PATH',
    };
  }

  const origin =
    (input.supabaseOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .trim()
      .replace(/\/$/, '');
  if (!origin) {
    return {
      ok: false,
      error: 'display_storage_not_configured',
      retryable: true,
      code: 'STORAGE_NOT_CONFIGURED',
    };
  }

  const displayImageUrl = deriveTokenImagePublicUrl(origin, path);
  const source: 'path' | 'draft' = path.startsWith('drafts/') ? 'draft' : 'path';

  if (!tokenRowPresent) {
    // Persist news intent even before index so browser drop cannot erase provenance.
    await ensureNewsFromBoundDraft({
      db: input.db,
      chainId: input.chainId,
      tokenAddress,
      draftId: resolvedDraftId,
      log,
    });
    log({
      event: 'bound_awaiting_canonical',
      tokenAddress,
      intentId: intent.id,
      intentFound: true,
      imageUriMatched: true,
      displayPathFound: true,
      bindResult: 'ok',
      canonicalRowPresent: false,
      finalized: false,
      displayPath: path,
      source,
    });
    return {
      ok: true,
      displayImageUrl,
      bound: true,
      finalized: false,
      intentId: intent.id,
      draftId: resolvedDraftId,
      source,
      tokenRowPresent: false,
    };
  }

  try {
    const write = await setTokenDisplayImageUrl(input.db, {
      chainId: input.chainId,
      tokenAddress,
      displayImageUrl,
    });

    await markDisplayFinalizeIntentResult(input.db, {
      id: intent.id,
      status: 'done',
    });

    await ensureNewsFromBoundDraft({
      db: input.db,
      chainId: input.chainId,
      tokenAddress,
      draftId: resolvedDraftId,
      log,
    });

    log({
      event: 'bound_and_finalized',
      tokenAddress,
      intentId: intent.id,
      intentFound: true,
      imageUriMatched: true,
      displayPathFound: true,
      bindResult: 'ok',
      canonicalRowPresent: true,
      finalized: true,
      displayPath: path,
      source,
      dbUpdated: write === 'applied',
    });

    return {
      ok: true,
      displayImageUrl,
      bound: true,
      finalized: true,
      intentId: intent.id,
      draftId: resolvedDraftId,
      source,
      tokenRowPresent: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'db_write_failed';
    log({
      event: 'finalize_write_failed',
      tokenAddress,
      intentId: intent.id,
      error: message,
      bindResult: 'ok',
      canonicalRowPresent: true,
      finalized: false,
    });
    // Intent is bound; caller still gets the public URL for immediate UX.
    await ensureNewsFromBoundDraft({
      db: input.db,
      chainId: input.chainId,
      tokenAddress,
      draftId: resolvedDraftId,
      log,
    });
    return {
      ok: true,
      displayImageUrl,
      bound: true,
      finalized: false,
      intentId: intent.id,
      draftId: resolvedDraftId,
      source,
      tokenRowPresent: true,
    };
  }
}
