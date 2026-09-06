import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { generateLaunchConcepts } from '../ai/concept-generator.js';
import { createNewsLaunchDraft } from '../drafts/service.js';
import type { LaunchConceptId } from '../ai/types.js';

loadLocalEnv();

function argValue(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name || a === `-${name.replace('--', '')}`) {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) return next;
    }
    if (a?.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const articleId = argValue(argv, '--article');
  const conceptRaw = argValue(argv, '--concept') ?? '1';
  if (!articleId) {
    throw new Error(
      'Usage: news:draft:create --article <providerArticleId> --concept <1|2|3>',
    );
  }

  const n = Number(conceptRaw);
  if (![1, 2, 3].includes(n)) {
    throw new Error('--concept must be 1, 2, or 3');
  }
  const conceptId = `concept_${n}` as LaunchConceptId;

  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createPool(databaseUrl);

  try {
    const concepts = await generateLaunchConcepts(
      { providerArticleId: articleId },
      { db: pool },
    );
    const concept = concepts.response.concepts.find((c) => c.id === conceptId);
    if (!concept) throw new Error(`Concept ${conceptId} missing`);

    const draft = await createNewsLaunchDraft(
      { providerArticleId: articleId, concept },
      { db: pool },
    );

    console.log(
      JSON.stringify(
        {
          level: 'info',
          command: 'news:draft:create',
          draftId: draft.id,
          article: draft.source,
          name: draft.name,
          symbol: draft.symbol,
          quote: draft.quote,
          conceptId,
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
      command: 'news:draft:create',
      error: message
        .replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
