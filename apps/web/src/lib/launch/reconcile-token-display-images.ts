import {
  bindAwaitingDisplayFinalizeIntents,
  bumpDisplayFinalizeIntentAttempt,
  expireStaleAwaitingDisplayFinalizeIntents,
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
 * Server-owned display finalization: bind pin-time intents → finalize pending →
 * orphan-scan recent tokens still missing display_image_url.
 * Does not require a browser post-launch request.
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
    const result = await finalize({
      db: input.db,
      chainId: orphan.chainId,
      tokenAddress: orphan.tokenAddress,
      draftId: orphan.draftId,
      imageUri: orphan.imageUri,
      waitForIndex: false,
      owner: 'server_reconciliation',
      log,
    });
    if (result.ok && (result.status === 'applied' || result.status === 'skipped')) {
      orphansApplied += 1;
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
  });

  return {
    bound,
    ambiguous,
    expired,
    intentsProcessed,
    intentsApplied,
    orphansProcessed,
    orphansApplied,
  };
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
