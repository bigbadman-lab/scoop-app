/**
 * Markets production-shaped simulation (N4B.1).
 * Exercises the final ingest path with writeEnabled=false.
 * Zero Markets article writes. Zero Markets checkpoint mutations.
 */

import { createPool, type Queryable } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { MARKETS_CHECKPOINT_PROVIDER } from '../feed-category.js';
import { isMarketsNewsWriteEnabled } from '../gate.js';
import {
  formatMarketsProductionSimulation,
  ingestMarketsOnce,
} from '../markets-ingest.js';
import { STOCKNEWS_PROVIDER } from '../normalize.js';
import { createStockNewsClient, sanitizeErrorMessage } from '../stocknews-client.js';

loadLocalEnv();

function createLookup(db: Queryable) {
  return async (providerArticleIds: string[]) => {
    const map = new Map<
      string,
      { exists: boolean; feedCategories: string[]; stocksEligible: boolean }
    >();
    if (providerArticleIds.length === 0) return map;

    // feed_categories may not exist until migration is applied — tolerate missing column.
    let rows: Array<{
      provider_article_id: string;
      feed_categories: string[] | null;
      stocks_eligible: boolean;
    }> = [];
    try {
      const result = await db.query<{
        provider_article_id: string;
        feed_categories: string[] | null;
        stocks_eligible: boolean;
      }>(
        `SELECT provider_article_id,
                COALESCE(feed_categories, '{}'::text[]) AS feed_categories,
                (
                  (market_relevance_score IS NOT NULL AND market_relevance_score >= 20
                    AND relevance_class IS NOT NULL AND relevance_class <> 'reject')
                  OR
                  (market_relevance_score IS NULL AND cardinality(provider_tickers) > 0)
                )
                AND is_backfill_candidate = FALSE AS stocks_eligible
         FROM provider_news_articles
         WHERE provider = $1
           AND provider_article_id = ANY($2::text[])`,
        [STOCKNEWS_PROVIDER, providerArticleIds],
      );
      rows = result.rows;
    } catch {
      const result = await db.query<{
        provider_article_id: string;
        stocks_eligible: boolean;
      }>(
        `SELECT provider_article_id,
                (
                  (market_relevance_score IS NOT NULL AND market_relevance_score >= 20
                    AND relevance_class IS NOT NULL AND relevance_class <> 'reject')
                  OR
                  (market_relevance_score IS NULL AND cardinality(provider_tickers) > 0)
                )
                AND is_backfill_candidate = FALSE AS stocks_eligible
         FROM provider_news_articles
         WHERE provider = $1
           AND provider_article_id = ANY($2::text[])`,
        [STOCKNEWS_PROVIDER, providerArticleIds],
      );
      rows = result.rows.map((r) => ({
        ...r,
        feed_categories: [] as string[],
      }));
    }

    const found = new Set<string>();
    for (const row of rows) {
      found.add(row.provider_article_id);
      map.set(row.provider_article_id, {
        exists: true,
        feedCategories: row.feed_categories ?? [],
        stocksEligible: Boolean(row.stocks_eligible),
      });
    }
    for (const id of providerArticleIds) {
      if (!found.has(id)) {
        map.set(id, { exists: false, feedCategories: [], stocksEligible: false });
      }
    }
    return map;
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  const token = (process.env.STOCK_NEWS_API_TOKEN ?? '').trim();
  if (!token) throw new Error('STOCK_NEWS_API_TOKEN is required');

  // Hard force: simulation never enables writes even if env is mis-set.
  if (isMarketsNewsWriteEnabled()) {
    console.error(
      JSON.stringify({
        level: 'error',
        command: 'news:markets:simulate',
        success: false,
        error:
          'Refusing to run simulation while SCOOP_MARKETS_NEWS_WRITE_ENABLED=true. Unset/false required.',
      }),
    );
    process.exitCode = 1;
    return;
  }

  const client = createStockNewsClient({
    token,
    timeoutMs: Number.parseInt(process.env.STOCK_NEWS_REQUEST_TIMEOUT_MS ?? '15000', 10) || 15_000,
    maxRetries: Number.parseInt(process.env.STOCK_NEWS_MAX_RETRIES ?? '3', 10) || 3,
  });

  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  let pool: ReturnType<typeof createPool> | null = null;

  try {
    let lookupExisting: ReturnType<typeof createLookup> | undefined;
    if (databaseUrl) {
      pool = createPool(databaseUrl);
      lookupExisting = createLookup(pool);
    }

    const result = await ingestMarketsOnce({
      client,
      db: pool ?? undefined,
      writeEnabled: false,
      tokenForSanitize: token,
      lookupExisting,
    });

    console.log(formatMarketsProductionSimulation(result));
    console.log(
      JSON.stringify({
        level: 'info',
        command: 'news:markets:simulate',
        stream: 'markets',
        success: result.success,
        writeEnabled: false,
        forcedWriteDisabled: true,
        checkpointStream: MARKETS_CHECKPOINT_PROVIDER,
        articleProvider: STOCKNEWS_PROVIDER,
        fetched: result.fetched,
        withinAgeWindow: result.withinAgeWindow,
        accepted: result.accepted,
        rejected: result.rejected,
        wouldInsert: result.wouldInsert,
        wouldUpdateMembership: result.wouldUpdateMembership,
        wouldCreateDualMembership: result.wouldCreateDualMembership,
        wouldSkipUnchanged: result.wouldSkipUnchanged,
        checkpointWouldAdvanceTo: result.checkpointWouldAdvanceTo,
        currentCheckpoint: result.currentCheckpoint,
        actualArticleWrites: result.inserted + result.updated,
        actualCheckpointAdvanced: result.checkpointAdvanced,
        duration_ms: result.durationMs || Date.now() - started,
        ...(result.error ? { error: result.error } : {}),
      }),
    );
  } finally {
    if (pool) await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      command: 'news:markets:simulate',
      success: false,
      writeEnabled: false,
      error: sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
        process.env.STOCK_NEWS_API_TOKEN,
      ),
    }),
  );
  process.exitCode = 1;
});
