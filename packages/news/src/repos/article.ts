import type { Queryable } from '@scoop/db';
import { TIINGO_PROVIDER } from '../normalize.js';
import type { ConceptArticleContext } from '../ai/types.js';
import { truncate } from '../ai/prompt.js';

type Row = {
  provider_article_id: string;
  title: string;
  description: string | null;
  source_domain: string;
  provider_published_at: Date | string;
  provider_crawled_at: Date | string;
  provider_tickers: string[] | null;
  provider_tags: string[] | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getNewsArticleForConcepts(
  db: Queryable,
  providerArticleId: string,
  provider: string = TIINGO_PROVIDER,
): Promise<ConceptArticleContext | null> {
  const id = providerArticleId.trim();
  if (!id) return null;

  const result = await db.query<Row>(
    `SELECT provider_article_id, title, description, source_domain,
            provider_published_at, provider_crawled_at,
            provider_tickers, provider_tags
     FROM provider_news_articles
     WHERE provider = $1 AND provider_article_id = $2
     LIMIT 1`,
    [provider, id],
  );

  const row = result.rows[0];
  if (!row) return null;

  const descriptionRaw = row.description?.trim() || null;

  return {
    providerArticleId: row.provider_article_id,
    headline: truncate(row.title.trim(), 200),
    description: descriptionRaw ? truncate(descriptionRaw, 600) : null,
    sourceDomain: row.source_domain,
    publishedAt: toIso(row.provider_published_at),
    crawledAt: toIso(row.provider_crawled_at),
    tickers: (row.provider_tickers ?? []).map((t) => t.toUpperCase()),
    tags: (row.provider_tags ?? []).slice(0, 12),
  };
}
