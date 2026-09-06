import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { generateLaunchConcepts } from '../ai/concept-generator.js';

loadLocalEnv();

function parseArticleId(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--article' || a === '-a') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Usage: news:concepts --article <providerArticleId>');
      }
      return next;
    }
    if (a?.startsWith('--article=')) {
      return a.slice('--article='.length);
    }
  }
  throw new Error('Usage: news:concepts --article <providerArticleId>');
}

async function main(): Promise<void> {
  const providerArticleId = parseArticleId(process.argv.slice(2));
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = createPool(databaseUrl);
  try {
    const result = await generateLaunchConcepts(
      { providerArticleId },
      { db: pool },
    );

    const { response, usage, enabledQuotes } = result;
    console.log(
      JSON.stringify(
        {
          level: 'info',
          command: 'news:concepts',
          article: response.article,
          availablePairs: enabledQuotes.map((q) => q.symbol),
          concepts: response.concepts.map((c) => ({
            id: c.id,
            name: c.name,
            ticker: c.ticker,
            description: c.description,
            pair: c.recommendedPairSymbol,
            pairAddress: c.recommendedPairAddress,
            pairRationale: c.pairRationale,
            imageDirection: c.imageDirection,
          })),
          model: usage.model,
          latencyMs: usage.latencyMs,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          repairAttempted: usage.repairAttempted,
        },
        null,
        2,
      ),
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
      command: 'news:concepts',
      error: message
        .replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
