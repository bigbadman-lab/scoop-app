import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadNewsConfig } from '../config.js';
import { createTiingoNewsClient } from '../tiingo-client.js';
import { catchupNews } from '../ingest.js';
import { isNewsPublicDisplayEnabled } from '../gate.js';

loadLocalEnv();

async function main(): Promise<void> {
  const config = loadNewsConfig();
  const pool = createPool(config.databaseUrl);
  const client = createTiingoNewsClient({
    token: config.tiingoApiToken,
    timeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
  });

  try {
    const result = await catchupNews({
      db: pool,
      client,
      tokenForSanitize: config.tiingoApiToken,
      limit: config.newsLimit,
      maxPages: config.newsMaxPages,
      backfillLagSeconds: config.backfillLagSeconds,
    });

    console.log(
      JSON.stringify({
        level: result.error ? 'error' : 'info',
        command: 'news:catchup',
        fetched: result.fetched,
        upserted: result.upserted,
        pages: result.pages,
        newestCrawlDate: result.newestCrawlDate,
        checkpointAdvanced: result.checkpointAdvanced,
        stoppedReason: result.stoppedReason,
        publicDisplayEnabled: isNewsPublicDisplayEnabled(),
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
