import type { Queryable } from '@scoop/db';
import {
  normalizeTiingoArticle,
  TIINGO_PROVIDER,
  DEFAULT_BACKFILL_LAG_SECONDS,
} from './normalize.js';
import {
  advanceNewsCheckpoint,
  ensureNewsCheckpoint,
  markNewsAttempt,
} from './repos/checkpoints.js';
import { upsertProviderNewsArticles } from './repos/articles.js';
import {
  createTiingoNewsClient,
  sanitizeErrorMessage,
  type TiingoNewsClient,
} from './tiingo-client.js';
import type { NewsIngestResult, ProviderNewsArticle, TiingoNewsArticleRaw } from './types.js';

export type IngestDeps = {
  db: Queryable;
  client: TiingoNewsClient;
  tokenForSanitize?: string;
  limit?: number;
  maxPages?: number;
  backfillLagSeconds?: number;
};

function pickNewest(articles: ProviderNewsArticle[]): {
  crawlDate: Date;
  articleId: string;
} | null {
  if (articles.length === 0) return null;
  let best = articles[0]!;
  for (const a of articles) {
    if (a.providerCrawledAt.getTime() > best.providerCrawledAt.getTime()) {
      best = a;
    } else if (
      a.providerCrawledAt.getTime() === best.providerCrawledAt.getTime() &&
      a.providerArticleId > best.providerArticleId
    ) {
      best = a;
    }
  }
  return { crawlDate: best.providerCrawledAt, articleId: best.providerArticleId };
}

export function normalizeBatch(
  raw: TiingoNewsArticleRaw[],
  backfillLagSeconds: number,
): ProviderNewsArticle[] {
  const out: ProviderNewsArticle[] = [];
  for (const item of raw) {
    try {
      out.push(normalizeTiingoArticle(item, { backfillLagSeconds }));
    } catch {
      // Skip malformed rows; do not fail entire poll
    }
  }
  return out;
}

/**
 * Pure catch-up page decision. Articles newest-first by crawlDate.
 */
export function selectCatchupPage(input: {
  articles: ProviderNewsArticle[];
  watermark: Date | null;
}): { toUpsert: ProviderNewsArticle[]; stop: boolean; reason: 'watermark' | 'continue' | 'empty' } {
  const { articles, watermark } = input;
  if (articles.length === 0) {
    return { toUpsert: [], stop: true, reason: 'empty' };
  }

  if (!watermark) {
    return { toUpsert: articles, stop: true, reason: 'watermark' };
  }

  const watermarkMs = watermark.getTime();
  const newer = articles.filter((a) => a.providerCrawledAt.getTime() > watermarkMs);
  const hitWatermark = articles.some((a) => a.providerCrawledAt.getTime() <= watermarkMs);

  if (hitWatermark) {
    return { toUpsert: newer, stop: true, reason: 'watermark' };
  }
  return { toUpsert: newer, stop: false, reason: 'continue' };
}

/** Prefer safe overlap: advance watermark to newest successfully upserted crawlDate. */
export async function ingestOnce(deps: IngestDeps): Promise<NewsIngestResult> {
  const limit = deps.limit ?? 100;
  const backfillLagSeconds = deps.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;
  const token = deps.tokenForSanitize;

  await ensureNewsCheckpoint(deps.db, TIINGO_PROVIDER);
  await markNewsAttempt(deps.db, TIINGO_PROVIDER, null);

  try {
    const raw = await deps.client.fetchNews({
      sortBy: 'crawlDate',
      limit,
      offset: 0,
    });
    const articles = normalizeBatch(raw, backfillLagSeconds);
    const upserted = await upsertProviderNewsArticles(deps.db, articles);
    const newest = pickNewest(articles);

    if (newest) {
      await advanceNewsCheckpoint(deps.db, {
        provider: TIINGO_PROVIDER,
        lastCrawlDate: newest.crawlDate,
        lastProviderArticleId: newest.articleId,
      });
    } else {
      await markNewsAttempt(deps.db, TIINGO_PROVIDER, null);
    }

    return {
      fetched: raw.length,
      upserted,
      newestCrawlDate: newest?.crawlDate.toISOString() ?? null,
      checkpointAdvanced: Boolean(newest),
      pages: 1,
      stoppedReason: raw.length === 0 ? 'empty' : 'complete',
    };
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      token,
    );
    await markNewsAttempt(deps.db, TIINGO_PROVIDER, message);
    return {
      fetched: 0,
      upserted: 0,
      newestCrawlDate: null,
      checkpointAdvanced: false,
      pages: 0,
      stoppedReason: 'error',
      error: message,
    };
  }
}

/**
 * Bounded catch-up: drain articles newer than checkpoint using limit+offset.
 * Stops at watermark, empty page, or max pages. Does not advance on error.
 */
export async function catchupNews(deps: IngestDeps): Promise<NewsIngestResult> {
  const limit = deps.limit ?? 100;
  const maxPages = deps.maxPages ?? 10;
  const backfillLagSeconds = deps.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;
  const token = deps.tokenForSanitize;

  const checkpoint = await ensureNewsCheckpoint(deps.db, TIINGO_PROVIDER);
  const watermark = checkpoint.lastCrawlDate;
  await markNewsAttempt(deps.db, TIINGO_PROVIDER, null);

  let fetched = 0;
  let upserted = 0;
  let pages = 0;
  const allUpserted: ProviderNewsArticle[] = [];
  let stoppedReason: NewsIngestResult['stoppedReason'] = 'complete';

  try {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const raw = await deps.client.fetchNews({
        sortBy: 'crawlDate',
        limit,
        offset,
      });
      pages += 1;
      fetched += raw.length;

      const articles = normalizeBatch(raw, backfillLagSeconds);
      const decision = selectCatchupPage({ articles, watermark });
      const n = await upsertProviderNewsArticles(deps.db, decision.toUpsert);
      upserted += n;
      allUpserted.push(...decision.toUpsert);

      if (decision.stop) {
        stoppedReason =
          decision.reason === 'empty'
            ? 'empty'
            : watermark && decision.reason === 'watermark'
              ? 'watermark'
              : 'complete';
        break;
      }

      if (page === maxPages - 1) {
        stoppedReason = 'max_pages';
      }
    }

    const newest = pickNewest(allUpserted);
    if (newest) {
      await advanceNewsCheckpoint(deps.db, {
        provider: TIINGO_PROVIDER,
        lastCrawlDate: newest.crawlDate,
        lastProviderArticleId: newest.articleId,
      });
    }

    return {
      fetched,
      upserted,
      newestCrawlDate: newest?.crawlDate.toISOString() ?? null,
      checkpointAdvanced: Boolean(newest),
      pages,
      stoppedReason,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      token,
    );
    await markNewsAttempt(deps.db, TIINGO_PROVIDER, message);
    return {
      fetched,
      upserted,
      newestCrawlDate: null,
      checkpointAdvanced: false,
      pages,
      stoppedReason: 'error',
      error: message,
    };
  }
}

export function createDefaultTiingoClient(input: {
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
}): TiingoNewsClient {
  return createTiingoNewsClient(input);
}
