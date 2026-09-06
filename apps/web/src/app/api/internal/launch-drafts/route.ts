import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import {
  createNewsLaunchDraft,
  ConceptValidationError,
  type LaunchConcept,
} from '@scoop/news';
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

export async function POST(request: Request) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    assertInternalAccess(request);
    if (!rateLimitInternal(clientIp(request))) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }
    const providerArticleId = String(
      (body as { providerArticleId?: unknown }).providerArticleId ?? '',
    ).trim();
    const concept = (body as { concept?: LaunchConcept }).concept;
    if (!providerArticleId || !concept) {
      throw new ValidationError('providerArticleId and concept are required');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = createPool(databaseUrl);

    const draft = await createNewsLaunchDraft(
      { providerArticleId, concept },
      { db: pool },
    );
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
      'POST /api/internal/launch-drafts',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}
