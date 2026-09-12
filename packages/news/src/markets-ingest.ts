/**
 * Markets ingest stream (N4B.1).
 *
 * Article provider identity: `stocknewsapi` (same as Stocks).
 * Checkpoint stream identity: `stocknewsapi:markets` (independent row).
 *
 * Writes (articles + Markets checkpoint) only when writeEnabled=true.
 * Default production guard is OFF via SCOOP_MARKETS_NEWS_WRITE_ENABLED.
 */

import type { Queryable } from '@scoop/db';
import { MARKETS_CHECKPOINT_PROVIDER } from './feed-category.js';
import { addFeedCategory } from './feed-membership.js';
import { isMarketsNewsWriteEnabled } from './gate.js';
import { normalizeBatchDetailed } from './ingest.js';
import {
  MARKETS_MAX_ARTICLE_AGE_MS,
  isWithinMarketsAgeWindow,
} from './markets-freshness.js';
import { evaluateMarketsNewsRelevance } from './markets-relevance.js';
import {
  DEFAULT_BACKFILL_LAG_SECONDS,
  STOCKNEWS_PROVIDER,
  stockNewsArticleId,
} from './normalize.js';
import {
  advanceNewsCheckpoint,
  ensureNewsCheckpoint,
  getNewsCheckpoint,
  markNewsAttempt,
} from './repos/checkpoints.js';
import { upsertProviderNewsArticles } from './repos/articles.js';
import {
  sanitizeErrorMessage,
  type StockNewsClient,
} from './stocknews-client.js';
import type { ProviderNewsArticle, StockNewsArticleRaw } from './types.js';

/** Bounded Markets pagination — keep auditable and small. */
export const MARKETS_ITEMS_PER_PAGE = 50;
export const MARKETS_MAX_PAGES = 4;

export type MarketsIngestDeps = {
  client: StockNewsClient;
  /** Required when writeEnabled; ignored for mutation when writeEnabled=false. */
  db?: Queryable;
  writeEnabled?: boolean;
  tokenForSanitize?: string;
  itemsPerPage?: number;
  maxPages?: number;
  maxAgeMs?: number;
  backfillLagSeconds?: number;
  now?: Date;
  /**
   * Optional read-only overlap lookup for simulation reporting.
   * Must not write.
   */
  lookupExisting?: (
    providerArticleIds: string[],
  ) => Promise<
    Map<
      string,
      {
        exists: boolean;
        feedCategories: string[];
        stocksEligible: boolean;
      }
    >
  >;
};

export type MarketsIngestResult = {
  stream: 'markets';
  writeEnabled: boolean;
  fetched: number;
  withinAgeWindow: number;
  accepted: number;
  rejected: number;
  pagesFetched: number;
  stoppedReason: 'complete' | 'max_pages' | 'age_horizon' | 'empty' | 'error' | 'guard_off_skip';
  rejectReasonCounts: Record<string, number>;
  /** Intended persistence (whether or not writes ran). */
  wouldInsert: number;
  wouldUpdateMembership: number;
  wouldCreateDualMembership: number;
  wouldSkipUnchanged: number;
  inserted: number;
  updated: number;
  unchanged: number;
  checkpointAdvanced: boolean;
  checkpointWouldAdvanceTo: {
    lastCrawlDate: string | null;
    lastProviderArticleId: string | null;
  } | null;
  currentCheckpoint: {
    exists: boolean;
    lastSuccessAt: string | null;
    lastProviderArticleId: string | null;
  };
  acceptedArticleIds: string[];
  error?: string;
  success: boolean;
  durationMs: number;
};

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function withMarketsMembership(article: ProviderNewsArticle): ProviderNewsArticle {
  return {
    ...article,
    feedCategories: addFeedCategory(article.feedCategories, 'markets'),
  };
}

/**
 * Fetch Markets pages newest-first until age horizon or max pages.
 */
export async function fetchMarketsRawArticles(input: {
  client: StockNewsClient;
  itemsPerPage?: number;
  maxPages?: number;
  maxAgeMs?: number;
  now?: Date;
}): Promise<{
  raw: StockNewsArticleRaw[];
  pagesFetched: number;
  stoppedReason: 'complete' | 'max_pages' | 'age_horizon' | 'empty';
}> {
  const itemsPerPage = Math.min(
    Math.max(input.itemsPerPage ?? MARKETS_ITEMS_PER_PAGE, 1),
    100,
  );
  const maxPages = input.maxPages ?? MARKETS_MAX_PAGES;
  const maxAgeMs = input.maxAgeMs ?? MARKETS_MAX_ARTICLE_AGE_MS;
  const now = input.now ?? new Date();

  const raw: StockNewsArticleRaw[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let stoppedReason: 'complete' | 'max_pages' | 'age_horizon' | 'empty' = 'empty';

  for (let page = 1; page <= maxPages; page += 1) {
    const { articles } = await input.client.fetchCategoryNews({
      section: 'general',
      items: itemsPerPage,
      page,
      type: 'article',
      extraFields: 'id,rankscore',
    });
    pagesFetched += 1;

    if (articles.length === 0) {
      stoppedReason = page === 1 ? 'empty' : 'complete';
      break;
    }

    let oldestOnPage: Date | null = null;
    for (const row of articles) {
      let key: string;
      try {
        key = stockNewsArticleId(row);
      } catch {
        key = String(row.news_url ?? row.title ?? '');
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw.push(row);

      const published = row.date ? new Date(String(row.date)) : null;
      if (published && !Number.isNaN(published.getTime())) {
        if (!oldestOnPage || published < oldestOnPage) oldestOnPage = published;
      }
    }

    if (oldestOnPage && now.getTime() - oldestOnPage.getTime() > maxAgeMs) {
      stoppedReason = 'age_horizon';
      break;
    }

    if (articles.length < itemsPerPage) {
      stoppedReason = 'complete';
      break;
    }

    if (page === maxPages) {
      stoppedReason = 'max_pages';
    }
  }

  return { raw, pagesFetched, stoppedReason };
}

/**
 * Production Markets ingest. Mutations only when writeEnabled=true.
 */
export async function ingestMarketsOnce(
  deps: MarketsIngestDeps,
): Promise<MarketsIngestResult> {
  const started = Date.now();
  const writeEnabled = deps.writeEnabled ?? isMarketsNewsWriteEnabled();
  const now = deps.now ?? new Date();
  const maxAgeMs = deps.maxAgeMs ?? MARKETS_MAX_ARTICLE_AGE_MS;
  const backfillLagSeconds = deps.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;
  const token = deps.tokenForSanitize;

  const emptyCheckpoint = {
    exists: false,
    lastSuccessAt: null as string | null,
    lastProviderArticleId: null as string | null,
  };

  let currentCheckpoint = emptyCheckpoint;
  if (deps.db) {
    try {
      const cp = await getNewsCheckpoint(deps.db, MARKETS_CHECKPOINT_PROVIDER);
      if (cp) {
        currentCheckpoint = {
          exists: true,
          lastSuccessAt: cp.lastSuccessAt?.toISOString() ?? null,
          lastProviderArticleId: cp.lastProviderArticleId,
        };
      }
    } catch {
      // Read failure should not crash simulation; write path still gated.
    }
  }

  try {
    const fetched = await fetchMarketsRawArticles({
      client: deps.client,
      itemsPerPage: deps.itemsPerPage,
      maxPages: deps.maxPages,
      maxAgeMs,
      now,
    });

    const normalized = normalizeBatchDetailed(
      fetched.raw,
      backfillLagSeconds,
    );

    const ageValid = normalized.articles.filter((a) =>
      isWithinMarketsAgeWindow(a.providerPublishedAt, now, maxAgeMs),
    );

    const rejectReasonCounts: Record<string, number> = {};
    const accepted: ProviderNewsArticle[] = [];

    for (const article of ageValid) {
      const relevance = evaluateMarketsNewsRelevance({
        title: article.title,
        description: article.description,
        tickers: article.providerTickers,
        tags: article.providerTags,
        sourceDomain: article.sourceDomain,
      });
      if (!relevance.accepted) {
        bump(rejectReasonCounts, relevance.reasons[0] ?? 'rejected');
        continue;
      }
      accepted.push(
        withMarketsMembership({
          ...article,
          marketRelevanceScore: relevance.score,
          relevanceClass: relevance.relevanceClass,
          relevanceReasons: relevance.reasons,
        }),
      );
    }

    const acceptedArticleIds = accepted.map((a) => a.providerArticleId);

    let wouldInsert = 0;
    let wouldUpdateMembership = 0;
    let wouldCreateDualMembership = 0;
    let wouldSkipUnchanged = 0;

    if (deps.lookupExisting && acceptedArticleIds.length > 0) {
      const existing = await deps.lookupExisting(acceptedArticleIds);
      for (const article of accepted) {
        const row = existing.get(article.providerArticleId);
        if (!row?.exists) {
          wouldInsert += 1;
          continue;
        }
        const alreadyMarkets = row.feedCategories.includes('markets');
        const alreadyStocks = row.feedCategories.includes('stocks') || row.stocksEligible;
        if (alreadyMarkets) {
          wouldSkipUnchanged += 1;
        } else {
          wouldUpdateMembership += 1;
          if (alreadyStocks) wouldCreateDualMembership += 1;
        }
      }
    } else {
      // Without lookup, treat all accepted as intended inserts for reporting.
      wouldInsert = accepted.length;
    }

    const newest =
      accepted.length > 0
        ? accepted.reduce((best, a) =>
            a.providerPublishedAt > best.providerPublishedAt ? a : best,
          )
        : null;

    const checkpointWouldAdvanceTo = newest
      ? {
          lastCrawlDate: newest.providerPublishedAt.toISOString(),
          lastProviderArticleId: newest.providerArticleId,
        }
      : null;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let checkpointAdvanced = false;

    if (writeEnabled) {
      if (!deps.db) {
        throw new Error('Markets writeEnabled requires db');
      }
      // Checkpoint stream identity ≠ article provider identity.
      await ensureNewsCheckpoint(deps.db, MARKETS_CHECKPOINT_PROVIDER);
      await markNewsAttempt(deps.db, MARKETS_CHECKPOINT_PROVIDER, null);

      const upsertStats = await upsertProviderNewsArticles(deps.db, accepted);
      inserted = upsertStats.inserted;
      updated = upsertStats.updated;
      unchanged = upsertStats.unchanged;

      if (newest) {
        await advanceNewsCheckpoint(deps.db, {
          provider: MARKETS_CHECKPOINT_PROVIDER,
          lastCrawlDate: newest.providerPublishedAt,
          lastProviderArticleId: newest.providerArticleId,
        });
        checkpointAdvanced = true;
      } else {
        // Successful empty accept set still clears error / records attempt success time
        await markNewsAttempt(deps.db, MARKETS_CHECKPOINT_PROVIDER, null);
      }
    }

    return {
      stream: 'markets',
      writeEnabled,
      fetched: fetched.raw.length,
      withinAgeWindow: ageValid.length,
      accepted: accepted.length,
      rejected: ageValid.length - accepted.length,
      pagesFetched: fetched.pagesFetched,
      stoppedReason: fetched.stoppedReason,
      rejectReasonCounts,
      wouldInsert,
      wouldUpdateMembership,
      wouldCreateDualMembership,
      wouldSkipUnchanged,
      inserted,
      updated,
      unchanged,
      checkpointAdvanced,
      checkpointWouldAdvanceTo,
      currentCheckpoint,
      acceptedArticleIds,
      success: true,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      token,
    );
    if (writeEnabled && deps.db) {
      try {
        await ensureNewsCheckpoint(deps.db, MARKETS_CHECKPOINT_PROVIDER);
        await markNewsAttempt(deps.db, MARKETS_CHECKPOINT_PROVIDER, message);
      } catch {
        // Isolation: checkpoint failure after error is secondary.
      }
    }
    return {
      stream: 'markets',
      writeEnabled,
      fetched: 0,
      withinAgeWindow: 0,
      accepted: 0,
      rejected: 0,
      pagesFetched: 0,
      stoppedReason: 'error',
      rejectReasonCounts: {},
      wouldInsert: 0,
      wouldUpdateMembership: 0,
      wouldCreateDualMembership: 0,
      wouldSkipUnchanged: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      checkpointAdvanced: false,
      checkpointWouldAdvanceTo: null,
      currentCheckpoint,
      acceptedArticleIds: [],
      error: message,
      success: false,
      durationMs: Date.now() - started,
    };
  }
}

export function formatMarketsProductionSimulation(
  result: MarketsIngestResult,
): string {
  const lines: string[] = [];
  lines.push('MARKETS PRODUCTION SIMULATION');
  lines.push('');
  lines.push(`writeEnabled: ${result.writeEnabled}`);
  lines.push('');
  lines.push(`Fetched: ${result.fetched}`);
  lines.push(`Age-valid: ${result.withinAgeWindow}`);
  lines.push(`Accepted: ${result.accepted}`);
  lines.push(`Rejected: ${result.rejected}`);
  lines.push('');
  lines.push(`Would insert: ${result.wouldInsert}`);
  lines.push(`Would update (add markets membership): ${result.wouldUpdateMembership}`);
  lines.push(
    `Would create dual membership (stocks+markets): ${result.wouldCreateDualMembership}`,
  );
  lines.push(`Would skip duplicate/no-change: ${result.wouldSkipUnchanged}`);
  lines.push('');
  lines.push('Checkpoint:');
  lines.push(
    `  current: exists=${result.currentCheckpoint.exists} lastSuccessAt=${result.currentCheckpoint.lastSuccessAt ?? 'null'} id=${result.currentCheckpoint.lastProviderArticleId ?? 'null'}`,
  );
  lines.push(
    `  would advance to: ${
      result.checkpointWouldAdvanceTo
        ? `${result.checkpointWouldAdvanceTo.lastCrawlDate} / ${result.checkpointWouldAdvanceTo.lastProviderArticleId}`
        : 'null (no accepted)'
    }`,
  );
  lines.push(
    `  actual mutation: ${result.checkpointAdvanced || result.writeEnabled ? (result.checkpointAdvanced ? 'YES' : 'NO') : 'NO'}`,
  );
  lines.push(`  article writes: inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged}`);
  lines.push(`  article provider identity: ${STOCKNEWS_PROVIDER}`);
  lines.push(`  checkpoint stream identity: ${MARKETS_CHECKPOINT_PROVIDER}`);
  return lines.join('\n');
}
