import type { Queryable } from '@scoop/db';
import { STOCKNEWS_PROVIDER } from './normalize.js';
import type { NewsFeedCategory } from './feed-category.js';
import { isNewsFeedCategory } from './feed-category.js';
import type { GetLatestNewsOptions, NewsFeedItem } from './types.js';

type Row = {
  provider_article_id: string;
  title: string;
  description: string | null;
  source_domain: string;
  url: string;
  image_url: string | null;
  provider_published_at: Date | string;
  provider_crawled_at: Date | string;
  provider_tickers: string[] | null;
  provider_tags: string[] | null;
  is_backfill_candidate: boolean;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: Row): NewsFeedItem {
  return {
    providerArticleId: row.provider_article_id,
    headline: row.title,
    description: row.description,
    sourceDomain: row.source_domain,
    url: row.url,
    publishedAt: toIso(row.provider_published_at),
    crawledAt: toIso(row.provider_crawled_at),
    tickers: row.provider_tickers ?? [],
    tags: row.provider_tags ?? [],
    isBackfillCandidate: row.is_backfill_candidate,
    imageUrl: row.image_url,
  };
}

/**
 * Public Stocks quality gate (preserved from pre-N4C.1 stockRelevantOnly).
 * Membership is separate: callers must also pass category='stocks'.
 */
export const STOCKS_PUBLIC_QUALITY_SQL = `(
  (market_relevance_score IS NOT NULL AND market_relevance_score >= 20
    AND relevance_class IS NOT NULL AND relevance_class <> 'reject')
  OR
  (market_relevance_score IS NULL AND cardinality(provider_tickers) > 0)
)`;

/**
 * Internal product query over `provider_news_articles`.
 * Public HTTP must still respect SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED.
 *
 * Category membership (N4C.1) is authoritative via feed_categories:
 *   category=stocks  → 'stocks' = ANY(feed_categories)
 *   category=markets → 'markets' = ANY(feed_categories)
 *
 * Ordering:
 * - `crawled` (default): `provider_crawled_at DESC`
 * - `published`: `provider_published_at DESC` — preferred for public UI
 * Tie-break always `provider_article_id DESC`.
 */
export async function getLatestNews(
  db: Queryable,
  options: GetLatestNewsOptions = {},
): Promise<NewsFeedItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const provider = options.provider ?? STOCKNEWS_PROVIDER;
  const orderBy = options.orderBy ?? 'crawled';
  const sortColumn =
    orderBy === 'published' ? 'provider_published_at' : 'provider_crawled_at';

  const params: unknown[] = [provider];
  const where: string[] = ['provider = $1'];

  if (options.excludeBackfill) {
    where.push('is_backfill_candidate = FALSE');
  }
  if (options.onlyWithTickers) {
    where.push('cardinality(provider_tickers) > 0');
  }

  if (options.category != null) {
    if (!isNewsFeedCategory(options.category)) {
      throw new Error(`Invalid news feed category: ${String(options.category)}`);
    }
    const category: NewsFeedCategory = options.category;
    params.push(category);
    // GIN-friendly containment: feed_categories @> ARRAY[category]
    where.push(`feed_categories @> ARRAY[$${params.length}]::text[]`);
  }

  if (options.stockRelevantOnly) {
    // Quality gate only — does not confer category membership.
    where.push(STOCKS_PUBLIC_QUALITY_SQL);
  }
  if (options.ticker) {
    params.push(options.ticker.trim().toUpperCase());
    where.push(`$${params.length} = ANY (provider_tickers)`);
  }

  if (options.cursor) {
    const cursorAt = new Date(options.cursor.at);
    if (Number.isNaN(cursorAt.getTime())) {
      throw new Error('Invalid news cursor timestamp');
    }
    params.push(cursorAt.toISOString());
    params.push(options.cursor.providerArticleId);
    where.push(
      `(${sortColumn}, provider_article_id) < ($${params.length - 1}::timestamptz, $${params.length})`,
    );
  }

  params.push(limit);
  const limitParam = `$${params.length}`;

  const result = await db.query<Row>(
    `SELECT provider_article_id, title, description, source_domain, url, image_url,
            provider_published_at, provider_crawled_at,
            provider_tickers, provider_tags, is_backfill_candidate
     FROM provider_news_articles
     WHERE ${where.join(' AND ')}
     ORDER BY ${sortColumn} DESC, provider_article_id DESC
     LIMIT ${limitParam}`,
    params,
  );

  return result.rows.map(mapRow);
}
