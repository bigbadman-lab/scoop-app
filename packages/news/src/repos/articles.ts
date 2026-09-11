import type { Queryable } from '@scoop/db';
import type { ProviderNewsArticle } from '../types.js';

export type UpsertNewsStats = {
  attempted: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

/**
 * Idempotent upsert by (provider, provider_article_id).
 * Empty/null provider fields do not erase useful stored metadata.
 * Unchanged rows (same content hash + key display fields) skip UPDATE.
 */
export async function upsertProviderNewsArticles(
  db: Queryable,
  articles: ProviderNewsArticle[],
): Promise<UpsertNewsStats> {
  const stats: UpsertNewsStats = {
    attempted: articles.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
  };
  if (articles.length === 0) return stats;

  for (const a of articles) {
    const result = await db.query<{ was_inserted: boolean }>(
      `INSERT INTO provider_news_articles (
         provider, provider_article_id, title, description, source_domain,
         url, canonical_url, image_url, provider_published_at, provider_crawled_at,
         provider_tickers, provider_tags, crawl_publish_lag_seconds,
         is_backfill_candidate, content_hash,
         market_relevance_score, relevance_class, relevance_reasons,
         ingested_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW()
       )
       ON CONFLICT (provider, provider_article_id) DO UPDATE SET
         title = COALESCE(NULLIF(EXCLUDED.title, ''), provider_news_articles.title),
         description = COALESCE(EXCLUDED.description, provider_news_articles.description),
         source_domain = COALESCE(NULLIF(EXCLUDED.source_domain, ''), provider_news_articles.source_domain),
         url = COALESCE(NULLIF(EXCLUDED.url, ''), provider_news_articles.url),
         canonical_url = COALESCE(EXCLUDED.canonical_url, provider_news_articles.canonical_url),
         image_url = COALESCE(EXCLUDED.image_url, provider_news_articles.image_url),
         provider_published_at = COALESCE(EXCLUDED.provider_published_at, provider_news_articles.provider_published_at),
         provider_crawled_at = EXCLUDED.provider_crawled_at,
         provider_tickers = CASE
           WHEN cardinality(EXCLUDED.provider_tickers) > 0 THEN EXCLUDED.provider_tickers
           ELSE provider_news_articles.provider_tickers
         END,
         provider_tags = CASE
           WHEN cardinality(EXCLUDED.provider_tags) > 0 THEN EXCLUDED.provider_tags
           ELSE provider_news_articles.provider_tags
         END,
         crawl_publish_lag_seconds = COALESCE(
           EXCLUDED.crawl_publish_lag_seconds,
           provider_news_articles.crawl_publish_lag_seconds
         ),
         is_backfill_candidate = EXCLUDED.is_backfill_candidate,
         content_hash = COALESCE(EXCLUDED.content_hash, provider_news_articles.content_hash),
         market_relevance_score = COALESCE(
           EXCLUDED.market_relevance_score,
           provider_news_articles.market_relevance_score
         ),
         relevance_class = COALESCE(EXCLUDED.relevance_class, provider_news_articles.relevance_class),
         relevance_reasons = CASE
           WHEN cardinality(EXCLUDED.relevance_reasons) > 0 THEN EXCLUDED.relevance_reasons
           ELSE provider_news_articles.relevance_reasons
         END,
         updated_at = NOW()
       WHERE provider_news_articles.content_hash IS DISTINCT FROM EXCLUDED.content_hash
          OR provider_news_articles.title IS DISTINCT FROM EXCLUDED.title
          OR provider_news_articles.description IS DISTINCT FROM EXCLUDED.description
          OR provider_news_articles.source_domain IS DISTINCT FROM EXCLUDED.source_domain
          OR provider_news_articles.url IS DISTINCT FROM EXCLUDED.url
          OR provider_news_articles.canonical_url IS DISTINCT FROM EXCLUDED.canonical_url
          OR provider_news_articles.image_url IS DISTINCT FROM EXCLUDED.image_url
          OR provider_news_articles.provider_published_at IS DISTINCT FROM EXCLUDED.provider_published_at
          OR provider_news_articles.provider_tickers IS DISTINCT FROM EXCLUDED.provider_tickers
          OR provider_news_articles.provider_tags IS DISTINCT FROM EXCLUDED.provider_tags
          OR provider_news_articles.market_relevance_score IS DISTINCT FROM EXCLUDED.market_relevance_score
          OR provider_news_articles.relevance_class IS DISTINCT FROM EXCLUDED.relevance_class
       RETURNING (xmax = 0) AS was_inserted`,
      [
        a.provider,
        a.providerArticleId,
        a.title,
        a.description,
        a.sourceDomain,
        a.url,
        a.canonicalUrl,
        a.imageUrl,
        a.providerPublishedAt.toISOString(),
        a.providerCrawledAt.toISOString(),
        a.providerTickers,
        a.providerTags,
        a.crawlPublishLagSeconds,
        a.isBackfillCandidate,
        a.contentHash,
        a.marketRelevanceScore ?? null,
        a.relevanceClass ?? null,
        a.relevanceReasons ?? [],
      ],
    );

    if (result.rows.length === 0) {
      stats.unchanged += 1;
    } else if (result.rows[0]?.was_inserted) {
      stats.inserted += 1;
    } else {
      stats.updated += 1;
    }
  }
  return stats;
}

export async function countProviderNewsArticles(
  db: Queryable,
  provider?: string,
): Promise<number> {
  if (provider) {
    const r = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM provider_news_articles WHERE provider = $1`,
      [provider],
    );
    return Number(r.rows[0]?.c ?? 0);
  }
  const r = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM provider_news_articles`,
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function countDuplicateProviderKeys(db: Queryable): Promise<number> {
  const r = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM (
       SELECT provider, provider_article_id
       FROM provider_news_articles
       GROUP BY provider, provider_article_id
       HAVING COUNT(*) > 1
     ) d`,
  );
  return Number(r.rows[0]?.c ?? 0);
}

export type NewsSmokeStats = {
  articleCount: number;
  newestCrawlDate: string | null;
  uniqueSources: number;
  tickerCoveragePct: number | null;
  backfillCandidateCount: number;
  duplicateKeys: number;
};

export async function getNewsSmokeStats(
  db: Queryable,
  provider: string,
): Promise<NewsSmokeStats> {
  const result = await db.query<{
    article_count: string;
    newest_crawl: Date | string | null;
    unique_sources: string;
    with_tickers: string;
    backfill_count: string;
  }>(
    `SELECT
       COUNT(*)::text AS article_count,
       MAX(provider_crawled_at) AS newest_crawl,
       COUNT(DISTINCT source_domain)::text AS unique_sources,
       COUNT(*) FILTER (WHERE cardinality(provider_tickers) > 0)::text AS with_tickers,
       COUNT(*) FILTER (WHERE is_backfill_candidate)::text AS backfill_count
     FROM provider_news_articles
     WHERE provider = $1`,
    [provider],
  );

  const row = result.rows[0];
  const articleCount = Number(row?.article_count ?? 0);
  const withTickers = Number(row?.with_tickers ?? 0);
  const newest = row?.newest_crawl;
  const newestCrawlDate =
    newest == null
      ? null
      : newest instanceof Date
        ? newest.toISOString()
        : new Date(newest).toISOString();

  return {
    articleCount,
    newestCrawlDate,
    uniqueSources: Number(row?.unique_sources ?? 0),
    tickerCoveragePct:
      articleCount > 0 ? Math.round((withTickers / articleCount) * 1000) / 10 : null,
    backfillCandidateCount: Number(row?.backfill_count ?? 0),
    duplicateKeys: await countDuplicateProviderKeys(db),
  };
}
