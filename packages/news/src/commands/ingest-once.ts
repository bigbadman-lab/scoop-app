import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadNewsConfig } from '../config.js';
import { createStockNewsClient } from '../stocknews-client.js';
import { ingestOnce } from '../ingest.js';
import { isNewsPublicDisplayEnabled } from '../gate.js';

loadLocalEnv();

async function main(): Promise<void> {
  const started = Date.now();
  const config = loadNewsConfig();
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
        dateWindow: result.dateWindow ?? config.dateWindow,
        topMentions: result.topMentions ?? 0,
        equitiesRetained: result.equitiesRetained ?? 0,
        nonEquitiesRemoved: result.nonEquitiesRemoved ?? 0,
        articleCalls: result.articleCalls ?? 0,
        fetched: result.fetched,
        deduped: result.deduped ?? result.fetched,
        accepted: result.accepted,
        rejected: result.rejected,
        upserted: result.upserted,
        newestCrawlDate: result.newestCrawlDate,
        checkpointAdvanced: result.checkpointAdvanced,
        stoppedReason: result.stoppedReason,
        rejectReasonCounts: result.rejectReasonCounts ?? {},
        universeSource: result.universeSource ?? null,
        publicDisplayEnabled: isNewsPublicDisplayEnabled(),
        duration_ms: Date.now() - started,
        ...(result.error ? { error: result.error } : {}),
      }),
    );

    if (result.error) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: 'error',
      command: 'news:ingest',
      error: message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
