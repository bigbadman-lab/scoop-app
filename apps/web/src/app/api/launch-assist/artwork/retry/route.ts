import { after, NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import {
  ConceptValidationError,
  generateSingleDraftArtwork,
  getDraftArtworkStatus,
  markDraftArtworkPending,
} from '@scoop/news';
import { resolveLaunchAssistAccess, launchAssistRateKey } from '@/lib/launch-assist/access';
import { LAUNCH_ASSIST_ARTWORK_RATE_LIMIT } from '@/lib/launch-assist/types';
import { readSessionFromRequest } from '@/lib/auth/session';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import { ValidationError, assertNoSecretLeakage } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

type Body = { draftId?: unknown; force?: unknown };

/**
 * Retry failed artwork, or force-regenerate when `force: true` (Generate another).
 * Does not start a second job while status is already `generating`.
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

    const ip = clientIp(request);
    if (
      !rateLimitInternal(
        launchAssistRateKey('artwork-retry', ip, access.session),
        LAUNCH_ASSIST_ARTWORK_RATE_LIMIT.windowMs,
        LAUNCH_ASSIST_ARTWORK_RATE_LIMIT.maxHits,
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
    const draftId = String(body?.draftId ?? '').trim();
    const force = body?.force === true;
    if (!draftId) {
      throw new ValidationError('draftId is required');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = createPool(databaseUrl);
    const current = await getDraftArtworkStatus(draftId, { db: pool });
    if (current.artworkStatus === 'generating') {
      return NextResponse.json({
        draftId,
        artworkStatus: 'generating' as const,
      });
    }
    if (!force && current.artworkStatus === 'ready' && current.previewUrl) {
      const payload = {
        draftId,
        artworkStatus: current.artworkStatus,
        previewUrl: current.previewUrl,
      };
      assertNoSecretLeakage(payload);
      return NextResponse.json(payload);
    }

    await markDraftArtworkPending(draftId, { db: pool });
    const bgUrl = databaseUrl;

    after(async () => {
      const bgPool = createPool(bgUrl);
      try {
        await generateSingleDraftArtwork(draftId, { db: bgPool });
      } catch (error) {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            message: 'artwork retry failed',
            draftId,
            error:
              error instanceof Error
                ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]').slice(0, 200)
                : 'error',
          }),
        );
      } finally {
        await bgPool.end().catch(() => undefined);
      }
    });

    const payload = { draftId, artworkStatus: 'pending' as const };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 });
    }
    if (error instanceof ConceptValidationError) {
      return NextResponse.json({ error: error.message, code: 'NOT_FOUND' }, { status: 404 });
    }
    console.error(
      'POST /api/launch-assist/artwork/retry',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json(
      { error: 'Could not retry artwork.', code: 'ERROR' },
      { status: 500 },
    );
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
