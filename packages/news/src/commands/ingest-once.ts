import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadNewsConfig } from '../config.js';
import { createStockNewsClient } from '../stocknews-client.js';
import { ingestOnce } from '../ingest.js';
import { isNewsPublicDisplayEnabled } from '../gate.js';
import { tryAcquireNewsIngestLock } from '../lock.js';

loadLocalEnv();

/**
 * One-shot production ingest entry (Render cron / CLI).
 * Acquires a Postgres advisory lock so overlapping ticks do not double-spend API quota.
 * Target schedule: every 15 minutes (see RENDER_NEWS_INGEST_CHECKLIST.md).
 * Do not edit Render from this phase.
 */
async function main(): Promise<void> {
  const started = Date.now();
  const config = loadNewsConfig();

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

  try {
    const result = await ingestOnce({
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

    console.log(
      JSON.stringify({
        level: result.error ? 'error' : 'info',
        command: 'news:ingest',
        provider: 'stocknewsapi',
        success: result.success !== false && !result.error,
        dateWindow: result.dateWindow ?? config.dateWindow,
        fetchWindowStrategy: result.fetchWindowStrategy ?? null,
        topMentions: result.topMentions ?? 0,
        equitiesRetained: result.equitiesRetained ?? 0,
        nonEquitiesRemoved: result.nonEquitiesRemoved ?? 0,
        articleCalls: result.articleCalls ?? 0,
        fetched: result.fetched,
        deduped: result.deduped ?? result.fetched,
        accepted: result.accepted,
        rejected: result.rejected,
        inserted: result.inserted ?? 0,
        updated: result.updated ?? 0,
        unchanged: result.unchanged ?? 0,
        skippedInvalid: result.skippedInvalid ?? 0,
        upserted: result.upserted,
        newestPublishedAt: result.newestPublishedAt ?? result.newestCrawlDate,
        oldestPublishedAt: result.oldestPublishedAt ?? null,
        newestCrawlDate: result.newestCrawlDate,
        checkpointAdvanced: result.checkpointAdvanced,
        stoppedReason: result.stoppedReason,
        rejectReasonCounts: result.rejectReasonCounts ?? {},
        universeSource: result.universeSource ?? null,
        publicDisplayEnabled: isNewsPublicDisplayEnabled(),
        duration_ms: result.durationMs ?? Date.now() - started,
        ...(result.error ? { error: result.error } : {}),
      }),
    );

    if (result.error) process.exitCode = 1;
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
