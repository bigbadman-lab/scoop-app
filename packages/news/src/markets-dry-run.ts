/**
 * Markets dry-run pipeline (N4B).
 *
 * Hard safety: this module never imports upsert/checkpoint writers and never
 * accepts a DB writer. Optional read-only overlap lookup is injected by the
 * caller (or omitted).
 */

import { normalizeBatchDetailed } from './ingest.js';
import {
  MARKETS_MAX_ARTICLE_AGE_MS,
  isWithinMarketsAgeWindow,
  marketsArticleAgeMs,
} from './markets-freshness.js';
import {
  evaluateMarketsNewsRelevance,
  type MarketsRelevance,
} from './markets-relevance.js';
import { DEFAULT_BACKFILL_LAG_SECONDS, stockNewsArticleId } from './normalize.js';
import type { StockNewsClient } from './stocknews-client.js';
import type { ProviderNewsArticle, StockNewsArticleRaw } from './types.js';

export type MarketsDryRunArticleView = {
  providerArticleId: string;
  title: string;
  sourceDomain: string;
  publishedAt: string;
  ageHours: number;
  topics: string[];
  tickers: string[];
  score: number;
  reasons: string[];
  relevanceClass: string;
  editorialBucket: string | null;
  alreadyInDb?: boolean;
  stocksEligible?: boolean | null;
};

export type MarketsDryRunResult = {
  fetched: number;
  withinAgeWindow: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  pagesFetched: number;
  maxAgeMs: number;
  acceptReasonCounts: Record<string, number>;
  rejectReasonCounts: Record<string, number>;
  editorialBuckets: Record<string, number>;
  acceptedSamples: MarketsDryRunArticleView[];
  rejectedSamples: MarketsDryRunArticleView[];
  overlap: {
    checked: boolean;
    alreadyStored: number;
    stocksEligibleOverlap: number;
  };
};

export type MarketsOverlapLookup = {
  /**
   * Read-only: which provider_article_ids already exist, and whether they
   * currently pass Stocks public eligibility. Must not write.
   */
  lookupArticleIds: (
    providerArticleIds: string[],
  ) => Promise<
    Map<
      string,
      {
        exists: boolean;
        stocksEligible: boolean;
      }
    >
  >;
};

export type MarketsDryRunDeps = {
  client: StockNewsClient;
  /** Target raw article sample size (default 150). */
  targetCount?: number;
  itemsPerPage?: number;
  maxPages?: number;
  maxAgeMs?: number;
  now?: Date;
  /** Optional read-only overlap check — never used for writes. */
  overlapLookup?: MarketsOverlapLookup;
  sampleLimit?: number;
};

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

function toView(
  article: ProviderNewsArticle,
  relevance: MarketsRelevance,
  now: Date,
  overlap?: { exists: boolean; stocksEligible: boolean },
): MarketsDryRunArticleView {
  const ageMs = marketsArticleAgeMs(article.providerPublishedAt, now);
  return {
    providerArticleId: article.providerArticleId,
    title: article.title,
    sourceDomain: article.sourceDomain,
    publishedAt: article.providerPublishedAt.toISOString(),
    ageHours: Math.round((ageMs / 3_600_000) * 10) / 10,
    topics: article.providerTags,
    tickers: article.providerTickers,
    score: relevance.score,
    reasons: relevance.reasons,
    relevanceClass: relevance.relevanceClass,
    editorialBucket: relevance.editorialBucket,
    alreadyInDb: overlap?.exists,
    stocksEligible: overlap?.stocksEligible ?? null,
  };
}

/**
 * Fetch + normalize + age-gate + Markets relevance. Zero persistence.
 */
export async function runMarketsDryRun(
  deps: MarketsDryRunDeps,
): Promise<MarketsDryRunResult> {
  const targetCount = deps.targetCount ?? 150;
  const itemsPerPage = Math.min(Math.max(deps.itemsPerPage ?? 50, 1), 100);
  const maxPages = deps.maxPages ?? 4;
  const maxAgeMs = deps.maxAgeMs ?? MARKETS_MAX_ARTICLE_AGE_MS;
  const now = deps.now ?? new Date();
  const sampleLimit = deps.sampleLimit ?? 15;

  const raw: StockNewsArticleRaw[] = [];
  const seenKeys = new Set<string>();
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages && raw.length < targetCount; page += 1) {
    const { articles } = await deps.client.fetchCategoryNews({
      section: 'general',
      items: itemsPerPage,
      page,
      type: 'article',
      extraFields: 'id,rankscore',
    });
    pagesFetched += 1;
    if (articles.length === 0) break;

    for (const row of articles) {
      let key: string;
      try {
        key = stockNewsArticleId(row);
      } catch {
        key = String(row.news_url ?? row.title ?? Math.random());
      }
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      raw.push(row);
      if (raw.length >= targetCount) break;
    }

    if (articles.length < itemsPerPage) break;
  }

  const normalized = normalizeBatchDetailed(raw, DEFAULT_BACKFILL_LAG_SECONDS);
  const ageValid = normalized.articles.filter((a) =>
    isWithinMarketsAgeWindow(a.providerPublishedAt, now, maxAgeMs),
  );

  const acceptReasonCounts: Record<string, number> = {};
  const rejectReasonCounts: Record<string, number> = {};
  const editorialBuckets: Record<string, number> = {};
  const accepted: MarketsDryRunArticleView[] = [];
  const rejected: MarketsDryRunArticleView[] = [];

  const decisions: Array<{
    article: ProviderNewsArticle;
    relevance: MarketsRelevance;
  }> = [];

  for (const article of ageValid) {
    const relevance = evaluateMarketsNewsRelevance({
      title: article.title,
      description: article.description,
      tickers: article.providerTickers,
      tags: article.providerTags,
      sourceDomain: article.sourceDomain,
    });
    decisions.push({ article, relevance });

    if (relevance.accepted) {
      for (const r of relevance.reasons) bump(acceptReasonCounts, r);
      if (relevance.editorialBucket) bump(editorialBuckets, relevance.editorialBucket);
    } else {
      bump(rejectReasonCounts, relevance.reasons[0] ?? 'rejected');
    }
  }

  let overlapMap = new Map<string, { exists: boolean; stocksEligible: boolean }>();
  let overlapChecked = false;
  if (deps.overlapLookup) {
    overlapChecked = true;
    const ids = decisions.map((d) => d.article.providerArticleId);
    overlapMap = await deps.overlapLookup.lookupArticleIds(ids);
  }

  let alreadyStored = 0;
  let stocksEligibleOverlap = 0;

  for (const { article, relevance } of decisions) {
    const overlap = overlapMap.get(article.providerArticleId);
    if (overlap?.exists) {
      alreadyStored += 1;
      if (overlap.stocksEligible) stocksEligibleOverlap += 1;
    }
    const view = toView(article, relevance, now, overlap);
    if (relevance.accepted) accepted.push(view);
    else rejected.push(view);
  }

  const withinAgeWindow = ageValid.length;
  const acceptedCount = accepted.length;
  const rejectedCount = rejected.length;

  return {
    fetched: raw.length,
    withinAgeWindow,
    accepted: acceptedCount,
    rejected: rejectedCount,
    acceptanceRate:
      withinAgeWindow === 0 ? 0 : Math.round((acceptedCount / withinAgeWindow) * 1000) / 10,
    pagesFetched,
    maxAgeMs,
    acceptReasonCounts: sortCounts(acceptReasonCounts),
    rejectReasonCounts: sortCounts(rejectReasonCounts),
    editorialBuckets: sortCounts(editorialBuckets),
    acceptedSamples: accepted.slice(0, sampleLimit),
    rejectedSamples: rejected.slice(0, sampleLimit),
    overlap: {
      checked: overlapChecked,
      alreadyStored,
      stocksEligibleOverlap,
    },
  };
}

/** Human-readable dry-run report (no secrets). */
export function formatMarketsDryRunReport(result: MarketsDryRunResult): string {
  const lines: string[] = [];
  lines.push('MARKETS DRY RUN');
  lines.push('');
  lines.push(`Fetched: ${result.fetched}`);
  lines.push(`Within age window: ${result.withinAgeWindow}`);
  lines.push(`Accepted: ${result.accepted}`);
  lines.push(`Rejected: ${result.rejected}`);
  lines.push(`Acceptance rate: ${result.acceptanceRate}%`);
  lines.push(
    `Age window: ${Math.round(result.maxAgeMs / 3_600_000)}h · pages: ${result.pagesFetched}`,
  );
  lines.push('');
  lines.push('Top accept reasons:');
  for (const [k, v] of Object.entries(result.acceptReasonCounts).slice(0, 12)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('Top reject reasons:');
  for (const [k, v] of Object.entries(result.rejectReasonCounts).slice(0, 12)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('Editorial buckets (accepted):');
  for (const [k, v] of Object.entries(result.editorialBuckets)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push(
    `Overlap: checked=${result.overlap.checked} alreadyStored=${result.overlap.alreadyStored} stocksEligible=${result.overlap.stocksEligibleOverlap}`,
  );
  lines.push('');
  lines.push('--- ACCEPTED SAMPLES ---');
  for (const a of result.acceptedSamples) {
    lines.push('ACCEPT');
    lines.push(`[${a.score}] ${a.title}`);
    lines.push(
      `  source=${a.sourceDomain} age=${a.ageHours}h topics=${a.topics.join(',') || '-'}`,
    );
    lines.push(`  reasons=${a.reasons.join(',')} bucket=${a.editorialBucket ?? '-'}`);
    lines.push('');
  }
  lines.push('--- REJECTED SAMPLES ---');
  for (const a of result.rejectedSamples) {
    lines.push('REJECT');
    lines.push(`[${a.score}] ${a.title}`);
    lines.push(
      `  source=${a.sourceDomain} age=${a.ageHours}h topics=${a.topics.join(',') || '-'}`,
    );
    lines.push(`  reasons=${a.reasons.join(',')}`);
    lines.push('');
  }
  return lines.join('\n');
}
