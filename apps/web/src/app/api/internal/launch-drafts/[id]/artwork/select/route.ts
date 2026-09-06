import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import { selectDraftArtwork, ConceptValidationError } from '@scoop/news';
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

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    assertInternalAccess(request);
    if (!rateLimitInternal(clientIp(request))) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    const { id } = await ctx.params;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }
    const artworkId = String(
      (body as { artworkId?: unknown }).artworkId ?? '',
    ).trim();
    if (!artworkId) throw new ValidationError('artworkId is required');

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = createPool(databaseUrl);

    const draft = await selectDraftArtwork(id, artworkId, { db: pool });
    assertNoSecretLeakage(draft);
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message === 'Unauthorized' ? 401 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof ConceptValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'POST /api/internal/launch-drafts/[id]/artwork/select',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}
