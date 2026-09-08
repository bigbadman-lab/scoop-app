import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadNewsConfig } from '../config.js';
import { createStockNewsClient } from '../stocknews-client.js';
import { catchupNews } from '../ingest.js';
import { isNewsPublicDisplayEnabled } from '../gate.js';

loadLocalEnv();

/** Alias of news:ingest — Stock News API has no Tiingo-style watermark catch-up. */
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
    const result = await catchupNews({
      db: pool,
      client,
      tokenForSanitize: config.stockNewsApiToken,
      itemsPerCall: config.itemsPerCall,
      batchSize: config.batchSize,
      dateWindow: config.dateWindow,
      fallbackDateWindow: config.fallbackDateWindow,
      backfillLagSeconds: config.backfillLagSeconds,
    });

    console.log(
      JSON.stringify({
        level: result.error ? 'error' : 'info',
        command: 'news:catchup',
        provider: 'stocknewsapi',
        note: 'alias_of_news_ingest',
        fetched: result.fetched,
        accepted: result.accepted,
        rejected: result.rejected,
        upserted: result.upserted,
        pages: result.pages,
        newestCrawlDate: result.newestCrawlDate,
        checkpointAdvanced: result.checkpointAdvanced,
        stoppedReason: result.stoppedReason,
        rejectReasonCounts: result.rejectReasonCounts ?? {},
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
      command: 'news:catchup',
      error: message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
