import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadNewsConfig } from '../config.js';
import { createStockNewsClient } from '../stocknews-client.js';
import { ingestOnce } from '../ingest.js';
import { ingestMarketsOnce } from '../markets-ingest.js';
import {
  isMarketsNewsWriteEnabled,
  isNewsPublicDisplayEnabled,
} from '../gate.js';
import { tryAcquireNewsIngestLock } from '../lock.js';
import { MARKETS_CHECKPOINT_PROVIDER } from '../feed-category.js';

loadLocalEnv();

/**
 * One-shot production ingest entry (Render cron / CLI).
 * Acquires a Postgres advisory lock so overlapping ticks do not double-spend API quota.
 * Target schedule: every 15 minutes (see RENDER_NEWS_INGEST_CHECKLIST.md).
 *
 * Streams (sequential, isolated):
 *  1) Stocks — always (existing top-mention → tickers path)
 *  2) Markets — only when SCOOP_MARKETS_NEWS_WRITE_ENABLED is explicitly true
 *
 * Do not edit Render from this phase. Markets writes default OFF.
 */
async function main(): Promise<void> {
  const started = Date.now();
  const config = loadNewsConfig();
  const marketsWriteEnabled = isMarketsNewsWriteEnabled();

  const lockResult = await tryAcquireNewsIngestLock({
    databaseUrl: config.databaseUrl,
  });
  if (!lockResult.ok) {
    if (lockResult.reason === 'unavailable') {
      console.log(
        JSON.stringify({
          level: 'info',
          command: 'news:ingest',
          provider: 'stocknewsapi',
          stoppedReason: 'lock_busy',
          success: true,
          duration_ms: Date.now() - started,
          message: 'Another news ingest is running; skipping this tick',
        }),
      );
      return;
    }
    console.error(
      JSON.stringify({
        level: 'error',
        command: 'news:ingest',
        provider: 'stocknewsapi',
        stoppedReason: 'error',
        success: false,
        error: lockResult.error ?? 'lock acquire failed',
        duration_ms: Date.now() - started,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const pool = createPool(config.databaseUrl);
  const client = createStockNewsClient({
    token: config.stockNewsApiToken,
    timeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
  });

  let stocksFailed = false;
  let marketsFailed = false;

  try {
    // --- Stocks stream ---
    const stocks = await ingestOnce({
      db: pool,
      client,
      tokenForSanitize: config.stockNewsApiToken,
      itemsPerCall: config.itemsPerCall,
      batchSize: config.batchSize,
      dateWindow: config.dateWindow,
      fallbackDateWindow: config.fallbackDateWindow,
      backfillLagSeconds: config.backfillLagSeconds,
      maxAgeHoursWithoutDate: config.maxAgeHoursWithoutDate,
    });

    stocksFailed = Boolean(stocks.error) || stocks.success === false;
    console.log(
      JSON.stringify({
        level: stocksFailed ? 'error' : 'info',
        command: 'news:ingest',
        stream: 'stocks',
        provider: 'stocknewsapi',
        success: !stocksFailed,
        dateWindow: stocks.dateWindow ?? config.dateWindow,
        fetchWindowStrategy: stocks.fetchWindowStrategy ?? null,
        topMentions: stocks.topMentions ?? 0,
        equitiesRetained: stocks.equitiesRetained ?? 0,
        nonEquitiesRemoved: stocks.nonEquitiesRemoved ?? 0,
        articleCalls: stocks.articleCalls ?? 0,
        fetched: stocks.fetched,
        deduped: stocks.deduped ?? stocks.fetched,
        accepted: stocks.accepted,
        rejected: stocks.rejected,
        inserted: stocks.inserted ?? 0,
        updated: stocks.updated ?? 0,
        unchanged: stocks.unchanged ?? 0,
        skippedInvalid: stocks.skippedInvalid ?? 0,
        upserted: stocks.upserted,
        newestPublishedAt: stocks.newestPublishedAt ?? stocks.newestCrawlDate,
        oldestPublishedAt: stocks.oldestPublishedAt ?? null,
        newestCrawlDate: stocks.newestCrawlDate,
        checkpointAdvanced: stocks.checkpointAdvanced,
        stoppedReason: stocks.stoppedReason,
        rejectReasonCounts: stocks.rejectReasonCounts ?? {},
        universeSource: stocks.universeSource ?? null,
        publicDisplayEnabled: isNewsPublicDisplayEnabled(),
        duration_ms: stocks.durationMs ?? null,
        ...(stocks.error ? { error: stocks.error } : {}),
      }),
    );

    // --- Markets stream (gated) ---
    if (!marketsWriteEnabled) {
      console.log(
        JSON.stringify({
          level: 'info',
          command: 'news:ingest',
          stream: 'markets',
          success: true,
          writeEnabled: false,
          skipped: true,
          checkpointStream: MARKETS_CHECKPOINT_PROVIDER,
          message:
            'Markets writes disabled (SCOOP_MARKETS_NEWS_WRITE_ENABLED). Skipping Markets fetch/persist. Use news:markets:simulate for write-disabled production-shaped dry run.',
        }),
      );
    } else {
      const markets = await ingestMarketsOnce({
        db: pool,
        client,
        writeEnabled: true,
        tokenForSanitize: config.stockNewsApiToken,
        backfillLagSeconds: config.backfillLagSeconds,
      });
      marketsFailed = !markets.success || Boolean(markets.error);
      console.log(
        JSON.stringify({
          level: marketsFailed ? 'error' : 'info',
          command: 'news:ingest',
          stream: 'markets',
          success: !marketsFailed,
          writeEnabled: true,
          checkpointStream: MARKETS_CHECKPOINT_PROVIDER,
          fetched: markets.fetched,
          withinAgeWindow: markets.withinAgeWindow,
          accepted: markets.accepted,
          rejected: markets.rejected,
          inserted: markets.inserted,
          updated: markets.updated,
          unchanged: markets.unchanged,
          checkpointAdvanced: markets.checkpointAdvanced,
          stoppedReason: markets.stoppedReason,
          rejectReasonCounts: markets.rejectReasonCounts,
          pagesFetched: markets.pagesFetched,
          duration_ms: markets.durationMs,
          ...(markets.error ? { error: markets.error } : {}),
        }),
      );
    }

    console.log(
      JSON.stringify({
        level: stocksFailed || marketsFailed ? 'error' : 'info',
        command: 'news:ingest',
        success: !stocksFailed && !marketsFailed,
        stocksFailed,
        marketsFailed,
        marketsWriteEnabled,
        duration_ms: Date.now() - started,
      }),
    );

    if (stocksFailed || marketsFailed) process.exitCode = 1;
  } finally {
    await pool.end();
    await lockResult.lock.release();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: 'error',
      command: 'news:ingest',
      success: false,
      error: message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
