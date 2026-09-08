import type { Queryable } from '@scoop/db';
import {
  normalizeStockNewsArticle,
  STOCKNEWS_PROVIDER,
  DEFAULT_BACKFILL_LAG_SECONDS,
} from './normalize.js';
import {
  advanceNewsCheckpoint,
  ensureNewsCheckpoint,
  markNewsAttempt,
} from './repos/checkpoints.js';
import { upsertProviderNewsArticles } from './repos/articles.js';
import {
  createStockNewsClient,
  sanitizeErrorMessage,
  StockNewsApiError,
  type StockNewsClient,
} from './stocknews-client.js';
import { filterEquityMentions, curatedEquityMentions } from './instruments.js';
import {
  partitionByScoopRelevance,
} from './relevance-partition.js';
import type { NewsIngestResult, ProviderNewsArticle, StockNewsArticleRaw } from './types.js';

export type IngestDeps = {
  db: Queryable;
  client: StockNewsClient;
  tokenForSanitize?: string;
  itemsPerCall?: number;
  batchSize?: number;
  dateWindow?: string;
  fallbackDateWindow?: string;
  backfillLagSeconds?: number;
  /** When the plan blocks date filters, drop articles older than this (hours). */
  maxAgeHoursWithoutDate?: number;
};

export function normalizeBatch(
  raw: StockNewsArticleRaw[],
  backfillLagSeconds: number,
): ProviderNewsArticle[] {
  const out: ProviderNewsArticle[] = [];
  for (const item of raw) {
    try {
      out.push(normalizeStockNewsArticle(item, { backfillLagSeconds }));
    } catch {
      // Skip malformed rows
    }
  }
  return out;
}

function dedupeRaw(rows: StockNewsArticleRaw[]): StockNewsArticleRaw[] {
  const seen = new Set<string>();
  const out: StockNewsArticleRaw[] = [];
  for (const row of rows) {
    const key = String(row.news_url ?? row.news_id ?? row.newsid ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isPlanBlocked(error: unknown): boolean {
  return (
    error instanceof StockNewsApiError &&
    error.status === 403 &&
    /not available with current subscription plan/i.test(error.message)
  );
}

function isDateParamBlocked(error: unknown): boolean {
  return (
    error instanceof StockNewsApiError &&
    error.status === 403 &&
    /\bdate\b.*not available with current subscription plan/i.test(error.message)
  );
}

async function fetchArticlesForUniverse(input: {
  client: StockNewsClient;
  tickers: string[];
  itemsPerCall: number;
  batchSize: number;
  dateWindow: string | null;
}): Promise<{
  raw: StockNewsArticleRaw[];
  articleCalls: number;
  effectiveItems: number;
  dateWindowUsed: string | null;
}> {
  let items = input.itemsPerCall;
  let articleCalls = 0;
  let dateWindow: string | null = input.dateWindow;
  const all: StockNewsArticleRaw[] = [];

  const batches = chunk(input.tickers, input.batchSize);
  for (let i = 0; i < batches.length; i++) {
    const tickers = batches[i]!;
    try {
      const rows = await input.client.fetchTickerNews({
        tickers,
        items,
        page: 1,
        type: 'article',
        ...(dateWindow ? { date: dateWindow } : {}),
      });
      articleCalls += 1;
      all.push(...rows);
    } catch (error) {
      // Some plans reject the date filter — retry this and later batches without it.
      if (dateWindow && isDateParamBlocked(error)) {
        dateWindow = null;
        const rows = await input.client.fetchTickerNews({
          tickers,
          items,
          page: 1,
          type: 'article',
        });
        articleCalls += 1;
        all.push(...rows);
        continue;
      }
      // Trial plans reject items>3 — fall back once and retry this batch.
      if (
        error instanceof StockNewsApiError &&
        error.status === 403 &&
        items > 3 &&
        /trial plans can query up to 3/i.test(error.message)
      ) {
        items = 3;
        const rows = await input.client.fetchTickerNews({
          tickers,
          items,
          page: 1,
          type: 'article',
          ...(dateWindow ? { date: dateWindow } : {}),
        });
        articleCalls += 1;
        all.push(...rows);
        continue;
      }
      throw error;
    }
  }

  return { raw: all, articleCalls, effectiveItems: items, dateWindowUsed: dateWindow };
}

/**
 * Production Stock News API ingest:
 * top-mention → equity filter → batched articles → dedupe → relevance → upsert.
 * Idempotent via (provider, provider_article_id).
 * Falls back to curated equity seed when /top-mention is plan-blocked.
 */
export async function ingestOnce(deps: IngestDeps): Promise<NewsIngestResult> {
  const itemsPerCall = deps.itemsPerCall ?? 50;
  const batchSize = deps.batchSize ?? 8;
  const dateWindow = deps.dateWindow ?? 'today';
  const fallbackDateWindow = deps.fallbackDateWindow ?? 'last7days';
  const backfillLagSeconds = deps.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;
  const token = deps.tokenForSanitize;

  await ensureNewsCheckpoint(deps.db, STOCKNEWS_PROVIDER);
  await markNewsAttempt(deps.db, STOCKNEWS_PROVIDER, null);

  try {
    let universeSource: 'top_mention' | 'curated_seed' = 'top_mention';
    let mentions: Awaited<ReturnType<StockNewsClient['fetchTopMentions']>> = [];
    try {
      mentions = await deps.client.fetchTopMentions({ date: dateWindow });
    } catch (error) {
      if (!isPlanBlocked(error)) throw error;
      universeSource = 'curated_seed';
      mentions = curatedEquityMentions().map((m) => ({
        ticker: m.ticker,
        name: m.name ?? null,
        totalMentions: null,
        positiveMentions: null,
        negativeMentions: null,
        neutralMentions: null,
        sentimentScore: null,
      }));
    }

    const { equities, removed } = filterEquityMentions(mentions);
    const equityTickers = equities.map((e) => e.ticker);

    if (equityTickers.length === 0) {
      await markNewsAttempt(deps.db, STOCKNEWS_PROVIDER, null);
      return {
        fetched: 0,
        accepted: 0,
        rejected: 0,
        upserted: 0,
        newestCrawlDate: null,
        checkpointAdvanced: false,
        pages: 1,
        stoppedReason: 'empty',
        topMentions: mentions.length,
        equitiesRetained: 0,
        nonEquitiesRemoved: removed.length,
        articleCalls: 0,
        deduped: 0,
        dateWindow,
        universeSource,
      };
    }

    let fetched = await fetchArticlesForUniverse({
      client: deps.client,
      tickers: equityTickers,
      itemsPerCall,
      batchSize,
      dateWindow,
    });

    // Only attempt last7days fallback when the plan still accepts date filters.
    if (
      fetched.raw.length < 8 &&
      fetched.dateWindowUsed != null &&
      fallbackDateWindow !== dateWindow
    ) {
      fetched = await fetchArticlesForUniverse({
        client: deps.client,
        tickers: equityTickers,
        itemsPerCall: fetched.effectiveItems,
        batchSize,
        dateWindow: fallbackDateWindow,
      });
    }

    const dedupedRaw = dedupeRaw(fetched.raw);
    let articles = normalizeBatch(dedupedRaw, backfillLagSeconds);

    // Without a plan date filter, SNA returns a deep archive — keep a fresh desk window.
    if (fetched.dateWindowUsed == null) {
      const maxAgeHours = deps.maxAgeHoursWithoutDate ?? 48;
      const cutoff = Date.now() - maxAgeHours * 3600_000;
      articles = articles.filter((a) => a.providerPublishedAt.getTime() >= cutoff);
      // Lag-based backfill flag is meaningless without a bounded window.
      articles = articles.map((a) => ({ ...a, isBackfillCandidate: false }));
    }

    const partitioned = partitionByScoopRelevance(articles);
    const upserted = await upsertProviderNewsArticles(deps.db, partitioned.accepted);

    const newest =
      partitioned.accepted.length > 0
        ? partitioned.accepted.reduce((best, a) =>
            a.providerPublishedAt > best.providerPublishedAt ? a : best,
          )
        : null;

    await advanceNewsCheckpoint(deps.db, {
      provider: STOCKNEWS_PROVIDER,
      lastCrawlDate: newest?.providerPublishedAt ?? new Date(),
      lastProviderArticleId: newest?.providerArticleId ?? null,
    });

    return {
      fetched: dedupedRaw.length,
      accepted: partitioned.accepted.length,
      rejected: partitioned.rejected,
      upserted,
      newestCrawlDate: newest?.providerPublishedAt.toISOString() ?? null,
      checkpointAdvanced: true,
      pages: fetched.articleCalls,
      stoppedReason: dedupedRaw.length === 0 ? 'empty' : 'complete',
      rejectReasonCounts: partitioned.rejectReasonCounts,
      topMentions: mentions.length,
      equitiesRetained: equities.length,
      nonEquitiesRemoved: removed.length,
      articleCalls: fetched.articleCalls,
      deduped: dedupedRaw.length,
      dateWindow: fetched.dateWindowUsed ?? 'none',
      universeSource,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      token,
    );
    await markNewsAttempt(deps.db, STOCKNEWS_PROVIDER, message);
    return {
      fetched: 0,
      accepted: 0,
      rejected: 0,
      upserted: 0,
      newestCrawlDate: null,
      checkpointAdvanced: false,
      pages: 0,
      stoppedReason: 'error',
      error: message,
    };
  }
}

/** Catch-up is not watermark-based for Stock News API — run a fresh ingest window. */
export async function catchupNews(deps: IngestDeps): Promise<NewsIngestResult> {
  return ingestOnce(deps);
}

/** @deprecated Tiingo catch-up selection removed; kept for test compatibility stubs. */
export function selectCatchupPage(input: {
  articles: ProviderNewsArticle[];
  watermark: Date | null;
}): { toUpsert: ProviderNewsArticle[]; stop: boolean; reason: 'watermark' | 'continue' | 'empty' } {
  const { articles, watermark } = input;
  if (articles.length === 0) return { toUpsert: [], stop: true, reason: 'empty' };
  if (!watermark) return { toUpsert: articles, stop: true, reason: 'watermark' };
  const watermarkMs = watermark.getTime();
  const newer = articles.filter((a) => a.providerCrawledAt.getTime() > watermarkMs);
  const hit = articles.some((a) => a.providerCrawledAt.getTime() <= watermarkMs);
  if (hit) return { toUpsert: newer, stop: true, reason: 'watermark' };
  return { toUpsert: newer, stop: false, reason: 'continue' };
}

export function createDefaultStockNewsClient(input: {
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
}): StockNewsClient {
  return createStockNewsClient(input);
}
