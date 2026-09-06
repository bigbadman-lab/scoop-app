import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import { generateDraftArtwork, ConceptValidationError } from '@scoop/news';
import {
  ValidationError,
  assertNoSecretLeakage,
} from '@/lib/server/validate';
import {
  assertInternalAccess,
  clientIp,
  rateLimitInternal,
} from '@/lib/server/internal-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Image generation can take a while. */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    assertInternalAccess(request);
    if (!rateLimitInternal(clientIp(request), 60_000, 5)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    const { id } = await ctx.params;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = createPool(databaseUrl);

    const result = await generateDraftArtwork(id, { db: pool });
    const payload = {
      draft: result.draft,
      generationId: result.generationId,
      imageCount: result.imageCount,
      model: result.model,
      quality: result.quality,
      latencyMs: result.latencyMs,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === 'Unauthorized' ? 401 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof ConceptValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'POST /api/internal/launch-drafts/[id]/artwork/generate',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}
