import type { Queryable } from '@scoop/db';
import {
  expireStaleNewsArticleMarketIntents,
  linkNewsArticleMarket,
  listPendingNewsArticleMarketIntents,
  markNewsArticleMarketIntentResult,
  bumpNewsArticleMarketIntentAttempt,
} from '@scoop/db';

export type ReconcileNewsArticleMarketsSummary = {
  pendingScanned: number;
  linked: number;
  stillPending: number;
  failed: number;
  expired: number;
};

/**
 * Recovery-only: complete pending news↔market intents once launches are indexed.
 */
export async function reconcileNewsArticleMarkets(args: {
  db: Queryable;
  limit?: number;
  maxAttempts?: number;
  staleHours?: number;
}): Promise<ReconcileNewsArticleMarketsSummary> {
  const expired = await expireStaleNewsArticleMarketIntents(args.db, {
    olderThanHours: args.staleHours ?? 72,
  });

  const pending = await listPendingNewsArticleMarketIntents(args.db, {
    limit: args.limit ?? 50,
    maxAttempts: args.maxAttempts ?? 30,
  });

  let linked = 0;
  let stillPending = 0;
  let failed = 0;

  for (const intent of pending) {
    const result = await linkNewsArticleMarket(args.db, {
      provider: intent.provider,
      providerArticleId: intent.providerArticleId,
      chainId: intent.chainId,
      tokenAddress: intent.tokenAddress,
      draftId: intent.draftId,
    });

    if (result.linked) {
      await markNewsArticleMarketIntentResult(args.db, {
        id: intent.id,
        status: 'done',
        lastError: null,
      });
      linked += 1;
      continue;
    }

    const reason = result.reason ?? 'link_failed';
    if (reason === 'article_not_found' || reason === 'invalid_input') {
      await markNewsArticleMarketIntentResult(args.db, {
        id: intent.id,
        status: 'failed',
        lastError: reason,
      });
      failed += 1;
      continue;
    }

    const bumped = await bumpNewsArticleMarketIntentAttempt(args.db, {
      id: intent.id,
      lastError: reason,
    });
    if (bumped?.status === 'failed') {
      failed += 1;
    } else {
      stillPending += 1;
    }
  }

  return {
    pendingScanned: pending.length,
    linked,
    stillPending,
    failed,
    expired,
  };
}
