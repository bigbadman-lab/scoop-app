import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import { ConceptValidationError, selectDraftArtwork } from '@scoop/news';
import { resolveLaunchAssistAccess, launchAssistRateKey } from '@/lib/launch-assist/access';
import { readSessionFromRequest } from '@/lib/auth/session';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import {
  ValidationError,
  assertNoSecretLeakage,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  draftId?: unknown;
  artworkId?: unknown;
  prompt?: unknown;
};

/**
 * Mark the chosen generated artwork on the draft (best-effort product select).
 */
export async function POST(request: Request) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    const session = readSessionFromRequest(request);
    const access = resolveLaunchAssistAccess(process.env, session);
    if (!access.ok) {
      const status = access.code === 'AUTH_REQUIRED' ? 401 : 403;
      return NextResponse.json(
        { error: access.message, code: access.code },
        { status },
      );
    }

    if (
      !rateLimitInternal(
        launchAssistRateKey('select', clientIp(request), access.session),
        60_000,
        10,
      )
    ) {
      return NextResponse.json(
        {
          error: "You've reached the current generation limit. Try again shortly.",
          code: 'RATE_LIMITED',
        },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }
    if (body.prompt != null) {
      throw new ValidationError('Arbitrary prompts are not accepted');
    }

    const draftId = String(body.draftId ?? '').trim();
    const artworkId = String(body.artworkId ?? '').trim();
    if (!draftId || !artworkId) {
      throw new ValidationError('draftId and artworkId are required');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = createPool(databaseUrl);

    const draft = await selectDraftArtwork(draftId, artworkId, { db: pool });
    const selected = draft.artworks.find((a) => a.assetId === draft.selectedArtworkId);
    const payload = {
      draftId: draft.id,
      selectedArtworkId: draft.selectedArtworkId,
      displayImageUrl: selected?.displayImageUrl ?? null,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 });
    }
    if (error instanceof ConceptValidationError) {
      return NextResponse.json(
        { error: 'Could not select artwork.', code: 'SELECT_FAILED' },
        { status: 400 },
      );
    }
    console.error(
      'POST /api/launch-assist/artwork/select',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json(
      { error: 'Could not select artwork.', code: 'ERROR' },
      { status: 500 },
    );
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}
