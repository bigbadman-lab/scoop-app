import {
  bindAwaitingDisplayFinalizeIntents,
  bumpDisplayFinalizeIntentAttempt,
  ensureNewsArticleMarketFromTrustedDraft,
  expireStaleAwaitingDisplayFinalizeIntents,
  listDoneDisplayIntentsMissingNewsLink,
  listOrphanTokenDisplayCandidates,
  listPendingDisplayFinalizeIntents,
  markDisplayFinalizeIntentResult,
  type Queryable,
} from '@scoop/db';
import {
  finalizeTokenDisplayImage,
  type FinalizeTokenDisplayImageResult,
} from '@/lib/launch/finalize-token-display-image';

export type ReconcileTokenDisplayImagesResult = {
  bound: number;
  ambiguous: number;
  expired: number;
  intentsProcessed: number;
  intentsApplied: number;
  orphansProcessed: number;
  orphansApplied: number;
  newsLoreHealed: number;
};

export type ReconcileTokenDisplayImagesInput = {
  db: Queryable;
  lookbackSeconds?: number;
  intentLimit?: number;
  orphanLimit?: number;
  maxAttempts?: number;
  finalize?: typeof finalizeTokenDisplayImage;
  log?: (fields: Record<string, unknown>) => void;
};

function defaultLog(fields: Record<string, unknown>): void {
  console.info('[token-display-finalize]', JSON.stringify(fields));
}

/**
 * Server-owned display finalization (recovery path):
 * bind pin-time intents → finalize pending → orphan-scan recent tokens.
 *
 * Normal launches should bind via receipt POST /api/launch/display-image/bind
 * and canonical indexer enrichment. This cron remains for recovery only
 * (closed browser, transient failures, deploy interruption).
 */
export async function reconcileTokenDisplayImages(
  input: ReconcileTokenDisplayImagesInput,
): Promise<ReconcileTokenDisplayImagesResult> {
  const log = input.log ?? defaultLog;
  const finalize = input.finalize ?? finalizeTokenDisplayImage;
  const lookbackSeconds = input.lookbackSeconds ?? 172_800;
  const intentLimit = input.intentLimit ?? 20;
  const orphanLimit = input.orphanLimit ?? 20;
  const maxAttempts = input.maxAttempts ?? 5;

  const expired = await expireStaleAwaitingDisplayFinalizeIntents(input.db, {
    olderThanSeconds: 604_800,
  });
  const { bound, ambiguous } = await bindAwaitingDisplayFinalizeIntents(input.db, {
    lookbackSeconds,
    limit: Math.max(intentLimit * 2, 40),
  });

  const pending = await listPendingDisplayFinalizeIntents(input.db, {
    limit: intentLimit,
    maxAttempts,
  });

  let intentsProcessed = 0;
  let intentsApplied = 0;
  for (const intent of pending) {
    if (intent.chainId == null || !intent.tokenAddress) continue;
    intentsProcessed += 1;
    const result = await finalize({
      db: input.db,
      chainId: intent.chainId,
      tokenAddress: intent.tokenAddress,
      displayImagePath: intent.displayImagePath,
      draftId: intent.displayImagePath ? null : intent.draftId,
      imageUri: intent.imageUri,
      waitForIndex: false,
      owner: 'server_reconciliation',
      log,
    });
    await applyIntentResult(input.db, intent.id, result, log);
    if (result.ok && (result.status === 'applied' || result.status === 'skipped')) {
      intentsApplied += 1;
      // Always use pin-time draft_id (cron may null draftId when path present).
      await ensureNewsFromDisplayIntent({
        db: input.db,
        chainId: intent.chainId,
        tokenAddress: intent.tokenAddress,
        draftId: intent.draftId,
        log,
      });
    }
  }

  const orphans = await listOrphanTokenDisplayCandidates(input.db, {
    lookbackSeconds,
    limit: orphanLimit,
  });

  let orphansProcessed = 0;
  let orphansApplied = 0;
  for (const orphan of orphans) {
    orphansProcessed += 1;
    const openIntent = await findOpenIntentImageSource(input.db, orphan.imageUri);
    const displayImagePath = openIntent?.displayImagePath ?? null;
    const result = await finalize({
      db: input.db,
      chainId: orphan.chainId,
      tokenAddress: orphan.tokenAddress,
      displayImagePath,
      draftId: displayImagePath ? null : (openIntent?.draftId ?? orphan.draftId),
      imageUri: orphan.imageUri,
      waitForIndex: false,
      owner: 'server_reconciliation',
      log,
    });
    if (result.ok && (result.status === 'applied' || result.status === 'skipped')) {
      orphansApplied += 1;
      await ensureNewsFromDisplayIntent({
        db: input.db,
        chainId: orphan.chainId,
        tokenAddress: orphan.tokenAddress,
        draftId: openIntent?.draftId ?? orphan.draftId,
        log,
      });
    } else if (!result.ok) {
      log({
        event: 'orphan_finalize_failed',
        owner: 'server_reconciliation',
        tokenAddress: orphan.tokenAddress,
        chainId: orphan.chainId,
        error: result.error,
        retryable: result.retryable,
      });
    }
  }

  let newsLoreHealed = 0;
  const missingNews = await listDoneDisplayIntentsMissingNewsLink(input.db, {
    lookbackSeconds,
    limit: intentLimit,
  });
  for (const row of missingNews) {
    const healed = await ensureNewsFromDisplayIntent({
      db: input.db,
      chainId: row.chainId,
      tokenAddress: row.tokenAddress,
      draftId: row.draftId,
      log,
    });
    if (healed) newsLoreHealed += 1;
  }

  log({
    event: 'reconcile_summary',
    owner: 'server_reconciliation',
    bound,
    ambiguous,
    expired,
    intentsProcessed,
    intentsApplied,
    orphansProcessed,
    orphansApplied,
    newsLoreHealed,
  });

  return {
    bound,
    ambiguous,
    expired,
    intentsProcessed,
    intentsApplied,
    orphansProcessed,
    orphansApplied,
    newsLoreHealed,
  };
}

async function ensureNewsFromDisplayIntent(args: {
  db: Queryable;
  chainId: number;
  tokenAddress: string;
  draftId?: string | null;
  log: (fields: Record<string, unknown>) => void;
}): Promise<boolean> {
  try {
    const news = await ensureNewsArticleMarketFromTrustedDraft(args.db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      draftId: args.draftId,
    });
    if (!news.ok) {
      args.log({
        event: 'news_lore_ensure_failed',
        tokenAddress: args.tokenAddress,
        reason: news.reason,
      });
      return false;
    }
    if (news.skipped) return false;
    args.log({
      event: 'news_lore_ensured',
      tokenAddress: args.tokenAddress,
      linked: news.linked,
      intentStatus: news.intent.status,
    });
    return true;
  } catch (error) {
    args.log({
      event: 'news_lore_ensure_error',
      tokenAddress: args.tokenAddress,
      error: error instanceof Error ? error.message : 'error',
    });
    return false;
  }
}

async function findOpenIntentImageSource(
  db: Queryable,
  imageUri: string,
): Promise<{ displayImagePath: string | null; draftId: string | null } | null> {
  const result = await db.query<{
    display_image_path: string | null;
    draft_id: string | null;
  }>(
    `SELECT display_image_path, draft_id
       FROM token_display_finalize_intents
      WHERE image_uri = $1
        AND status IN ('awaiting_token', 'pending')
      ORDER BY updated_at DESC
      LIMIT 1`,
    [imageUri.trim()],
  );
  const row = result.rows[0];
  return row
    ? {
        displayImagePath: row.display_image_path,
        draftId: row.draft_id,
      }
    : null;
}

async function applyIntentResult(
  db: Queryable,
  intentId: string,
  result: FinalizeTokenDisplayImageResult,
  log: (fields: Record<string, unknown>) => void,
): Promise<void> {
  if (result.ok) {
    const status =
      result.status === 'noop' ? 'noop' : result.status === 'skipped' ? 'done' : 'done';
    await markDisplayFinalizeIntentResult(db, {
      id: intentId,
      status,
    });
    return;
  }
  if (result.retryable) {
    await bumpDisplayFinalizeIntentAttempt(db, {
      id: intentId,
      error: result.error,
    });
    log({
      event: 'intent_retryable_failure',
      owner: 'server_reconciliation',
      intentId,
      error: result.error,
      retries: result.retries,
    });
    return;
  }
  await markDisplayFinalizeIntentResult(db, {
    id: intentId,
    status: 'failed',
    error: result.error,
  });
}
