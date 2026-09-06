import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { generateDraftArtwork } from '../drafts/service.js';

loadLocalEnv();

function argValue(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) return next;
    }
    if (a?.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const draftId = argValue(argv, '--draft');
  if (!draftId) {
    throw new Error('Usage: news:draft:artwork --draft <uuid>');
  }

  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createPool(databaseUrl);

  try {
    const result = await generateDraftArtwork(draftId, { db: pool });
    console.log(
      JSON.stringify(
        {
          level: 'info',
          command: 'news:draft:artwork',
          draftId: result.draft.id,
          generationId: result.generationId,
          imageCount: result.imageCount,
          model: result.model,
          quality: result.quality,
          latencyMs: result.latencyMs,
          artworks: result.draft.artworks.map((a) => ({
            styleId: a.id,
            style: a.style,
            assetId: a.assetId,
            hasPreviewUrl: Boolean(a.previewUrl),
            width: a.width,
            height: a.height,
          })),
          selectedArtworkId: result.draft.selectedArtworkId,
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
      command: 'news:draft:artwork',
      error: message
        .replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'),
    }),
  );
  process.exitCode = 1;
});
