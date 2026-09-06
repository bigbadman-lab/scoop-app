import type { Queryable } from '@scoop/db';
import type { NewsIngestionCheckpoint } from '../types.js';
import { TIINGO_PROVIDER } from '../normalize.js';

type CheckpointRow = {
  provider: string;
  last_crawl_date: Date | string | null;
  last_provider_article_id: string | null;
  last_success_at: Date | string | null;
  last_attempt_at: Date | string | null;
  last_error: string | null;
  updated_at: Date | string;
};

function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: CheckpointRow): NewsIngestionCheckpoint {
  return {
    provider: row.provider,
    lastCrawlDate: toDate(row.last_crawl_date),
    lastProviderArticleId: row.last_provider_article_id,
    lastSuccessAt: toDate(row.last_success_at),
    lastAttemptAt: toDate(row.last_attempt_at),
    lastError: row.last_error,
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

export async function getNewsCheckpoint(
  db: Queryable,
  provider: string = TIINGO_PROVIDER,
): Promise<NewsIngestionCheckpoint | null> {
  const result = await db.query<CheckpointRow>(
    `SELECT provider, last_crawl_date, last_provider_article_id,
            last_success_at, last_attempt_at, last_error, updated_at
     FROM news_ingestion_checkpoints
     WHERE provider = $1`,
    [provider],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function ensureNewsCheckpoint(
  db: Queryable,
  provider: string = TIINGO_PROVIDER,
): Promise<NewsIngestionCheckpoint> {
  await db.query(
    `INSERT INTO news_ingestion_checkpoints (provider, updated_at)
     VALUES ($1, NOW())
     ON CONFLICT (provider) DO NOTHING`,
    [provider],
  );
  const cp = await getNewsCheckpoint(db, provider);
  if (!cp) throw new Error(`Failed to ensure checkpoint for ${provider}`);
  return cp;
}

export async function markNewsAttempt(
  db: Queryable,
  provider: string,
  error: string | null,
): Promise<void> {
  await db.query(
    `UPDATE news_ingestion_checkpoints
     SET last_attempt_at = NOW(),
         last_error = $2,
         updated_at = NOW()
     WHERE provider = $1`,
    [provider, error],
  );
}

export async function advanceNewsCheckpoint(
  db: Queryable,
  input: {
    provider: string;
    lastCrawlDate: Date;
    lastProviderArticleId: string | null;
  },
): Promise<void> {
  await db.query(
    `UPDATE news_ingestion_checkpoints
     SET last_crawl_date = CASE
           WHEN last_crawl_date IS NULL OR $2 > last_crawl_date THEN $2
           ELSE last_crawl_date
         END,
         last_provider_article_id = CASE
           WHEN last_crawl_date IS NULL OR $2 >= last_crawl_date THEN $3
           ELSE last_provider_article_id
         END,
         last_success_at = NOW(),
         last_attempt_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE provider = $1`,
    [input.provider, input.lastCrawlDate, input.lastProviderArticleId],
  );
}
