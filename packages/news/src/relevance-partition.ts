import type { ProviderNewsArticle } from './types.js';
import {
  evaluateScoopNewsRelevance,
  type ScoopNewsRelevance,
} from './relevance.js';

export type RelevancePartition = {
  accepted: ProviderNewsArticle[];
  rejected: number;
  rejectReasonCounts: Record<string, number>;
};

/**
 * Attach SCOOP relevance metadata and keep only accepted stock/equity stories.
 * Watermark advancement should still use the pre-filter batch.
 */
export function partitionByScoopRelevance(
  articles: ProviderNewsArticle[],
): RelevancePartition {
  const accepted: ProviderNewsArticle[] = [];
  const rejectReasonCounts: Record<string, number> = {};
  let rejected = 0;

  for (const article of articles) {
    const relevance = evaluateScoopNewsRelevance({
      title: article.title,
      description: article.description,
      tickers: article.providerTickers,
      tags: article.providerTags,
      sourceDomain: article.sourceDomain,
    });

    if (!relevance.accepted) {
      rejected += 1;
      const key = relevance.reasons[0] ?? 'rejected';
      rejectReasonCounts[key] = (rejectReasonCounts[key] ?? 0) + 1;
      continue;
    }

    accepted.push(attachRelevance(article, relevance));
  }

  return { accepted, rejected, rejectReasonCounts };
}

export function attachRelevance(
  article: ProviderNewsArticle,
  relevance: ScoopNewsRelevance,
): ProviderNewsArticle {
  return {
    ...article,
    providerTickers:
      relevance.tickers.length > 0 ? relevance.tickers : article.providerTickers,
    marketRelevanceScore: relevance.score,
    relevanceClass: relevance.relevanceClass,
    relevanceReasons: relevance.reasons,
  };
}

export function mergeRejectReasonCounts(
  into: Record<string, number>,
  from: Record<string, number>,
): void {
  for (const [key, count] of Object.entries(from)) {
    into[key] = (into[key] ?? 0) + count;
  }
}
