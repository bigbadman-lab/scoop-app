import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { getNewsCheckpoint } from '../repos/checkpoints.js';
import { getNewsSmokeStats } from '../repos/articles.js';
import { STOCKNEWS_PROVIDER } from '../normalize.js';
import { isNewsPublicDisplayEnabled } from '../gate.js';

loadLocalEnv();

async function main(): Promise<void> {
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = createPool(databaseUrl);

  try {
    const stats = await getNewsSmokeStats(pool, STOCKNEWS_PROVIDER);
    const checkpoint = await getNewsCheckpoint(pool, STOCKNEWS_PROVIDER);

    console.log(
      JSON.stringify({
        level: 'info',
        command: 'news:smoke',
        articleCount: stats.articleCount,
        newestCrawlDate: stats.newestCrawlDate,
        uniqueSources: stats.uniqueSources,
        tickerCoveragePct: stats.tickerCoveragePct,
        backfillCandidateCount: stats.backfillCandidateCount,
        duplicateKeys: stats.duplicateKeys,
        checkpoint: checkpoint
          ? {
              lastCrawlDate: checkpoint.lastCrawlDate?.toISOString() ?? null,
              lastProviderArticleId: checkpoint.lastProviderArticleId,
              lastSuccessAt: checkpoint.lastSuccessAt?.toISOString() ?? null,
              lastError: checkpoint.lastError,
            }
          : null,
        publicDisplayEnabled: isNewsPublicDisplayEnabled(),
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: 'error',
      command: 'news:smoke',
      error: message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
