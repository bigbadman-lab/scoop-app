/**
 * N4B Markets dry-run CLI.
 *
 * Hard guarantees:
 * - never imports upsert / checkpoint advance / mark attempt writers
 * - never opens a write transaction for articles
 * - optional DATABASE_URL is used only for read-only overlap SELECT
 */

import { createPool, type Queryable } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import {
  formatMarketsDryRunReport,
  runMarketsDryRun,
  type MarketsOverlapLookup,
} from '../markets-dry-run.js';
import { MARKETS_MAX_ARTICLE_AGE_MS } from '../markets-freshness.js';
import { createStockNewsClient, sanitizeErrorMessage } from '../stocknews-client.js';
import { STOCKNEWS_PROVIDER } from '../normalize.js';

loadLocalEnv();

function loadToken(): string {
  const token = (process.env.STOCK_NEWS_API_TOKEN ?? '').trim();
  if (!token) throw new Error('STOCK_NEWS_API_TOKEN is required');
  return token;
}

function createReadOnlyOverlapLookup(db: Queryable): MarketsOverlapLookup {
  return {
    async lookupArticleIds(providerArticleIds) {
      const map = new Map<string, { exists: boolean; stocksEligible: boolean }>();
      if (providerArticleIds.length === 0) return map;

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

      const found = new Set<string>();
      for (const row of result.rows) {
        found.add(row.provider_article_id);
        map.set(row.provider_article_id, {
          exists: true,
          stocksEligible: Boolean(row.stocks_eligible),
        });
      }
      for (const id of providerArticleIds) {
        if (!found.has(id)) {
          map.set(id, { exists: false, stocksEligible: false });
        }
      }
      return map;
    },
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  const token = loadToken();
  const client = createStockNewsClient({
    token,
    timeoutMs: Number.parseInt(process.env.STOCK_NEWS_REQUEST_TIMEOUT_MS ?? '15000', 10) || 15_000,
    maxRetries: Number.parseInt(process.env.STOCK_NEWS_MAX_RETRIES ?? '3', 10) || 3,
  });

  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  let pool: ReturnType<typeof createPool> | null = null;
  let overlapLookup: MarketsOverlapLookup | undefined;

  try {
    if (databaseUrl) {
      pool = createPool(databaseUrl);
      overlapLookup = createReadOnlyOverlapLookup(pool);
    }

    const result = await runMarketsDryRun({
      client,
      targetCount: 150,
      itemsPerPage: 50,
      maxPages: 4,
      maxAgeMs: MARKETS_MAX_ARTICLE_AGE_MS,
      overlapLookup,
      sampleLimit: 20,
    });

    console.log(formatMarketsDryRunReport(result));
    console.log(
      JSON.stringify({
        level: 'info',
        command: 'news:markets:dry-run',
        success: true,
        writes: false,
        persistence: 'none',
        checkpointMutations: false,
        fetched: result.fetched,
        withinAgeWindow: result.withinAgeWindow,
        accepted: result.accepted,
        rejected: result.rejected,
        acceptanceRate: result.acceptanceRate,
        maxAgeHours: Math.round(result.maxAgeMs / 3_600_000),
        acceptReasonCounts: result.acceptReasonCounts,
        rejectReasonCounts: result.rejectReasonCounts,
        editorialBuckets: result.editorialBuckets,
        overlap: result.overlap,
        duration_ms: Date.now() - started,
      }),
    );
  } finally {
    if (pool) await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = sanitizeErrorMessage(
    error instanceof Error ? error.message : String(error),
    process.env.STOCK_NEWS_API_TOKEN,
  );
  console.error(
    JSON.stringify({
      level: 'error',
      command: 'news:markets:dry-run',
      success: false,
      writes: false,
      error: message,
    }),
  );
  process.exitCode = 1;
});
