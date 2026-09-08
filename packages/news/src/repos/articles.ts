import type { Queryable } from '@scoop/db';
import type { ProviderNewsArticle } from '../types.js';

export async function upsertProviderNewsArticles(
  db: Queryable,
  articles: ProviderNewsArticle[],
): Promise<number> {
  if (articles.length === 0) return 0;

  let upserted = 0;
  for (const a of articles) {
    await db.query(
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
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         source_domain = EXCLUDED.source_domain,
         url = EXCLUDED.url,
         canonical_url = EXCLUDED.canonical_url,
         image_url = EXCLUDED.image_url,
         provider_published_at = EXCLUDED.provider_published_at,
         provider_crawled_at = EXCLUDED.provider_crawled_at,
         provider_tickers = EXCLUDED.provider_tickers,
         provider_tags = EXCLUDED.provider_tags,
         crawl_publish_lag_seconds = EXCLUDED.crawl_publish_lag_seconds,
         is_backfill_candidate = EXCLUDED.is_backfill_candidate,
         content_hash = EXCLUDED.content_hash,
         market_relevance_score = EXCLUDED.market_relevance_score,
         relevance_class = EXCLUDED.relevance_class,
         relevance_reasons = EXCLUDED.relevance_reasons,
         updated_at = NOW()`,
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
    upserted += 1;
  }
  return upserted;
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
