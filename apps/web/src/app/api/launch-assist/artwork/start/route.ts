import { after, NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import {
  ConceptValidationError,
  createNewsLaunchDraft,
  generateSingleDraftArtwork,
  markDraftArtworkPending,
} from '@scoop/news';
import { resolveLaunchAssistAccess, launchAssistRateKey } from '@/lib/launch-assist/access';
import {
  LAUNCH_ASSIST_ARTWORK_RATE_LIMIT,
  isLaunchConceptId,
  toLaunchConceptInput,
  type PublicLaunchConcept,
} from '@/lib/launch-assist/types';
import { readSessionFromRequest } from '@/lib/auth/session';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import {
  ValidationError,
  assertNoSecretLeakage,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Background generation may continue via after(); start itself stays fast. */
export const maxDuration = 120;

type Body = {
  providerArticleId?: unknown;
  concept?: unknown;
  headline?: unknown;
  articleText?: unknown;
  description?: unknown;
  prompt?: unknown;
  imagePrompt?: unknown;
  systemPrompt?: unknown;
};

function parseConcept(raw: unknown): PublicLaunchConcept {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('concept is required');
  }
  const c = raw as Record<string, unknown>;
  if (!isLaunchConceptId(c.id)) {
    throw new ValidationError('Invalid concept id');
  }
  const name = String(c.name ?? '').trim();
  const ticker = String(c.ticker ?? '').trim();
  const description = String(c.description ?? '').trim();
  const recommendedPairAddress = String(c.recommendedPairAddress ?? '')
    .trim()
    .toLowerCase();
  const recommendedPairSymbol = String(c.recommendedPairSymbol ?? '').trim();
  const pairRationale = String(c.pairRationale ?? '').trim();
  const imageDirection = String(c.imageDirection ?? '').trim();
  if (
    !name ||
    !ticker ||
    !description ||
    !recommendedPairAddress ||
    !recommendedPairSymbol ||
    !pairRationale ||
    !imageDirection
  ) {
    throw new ValidationError('concept is incomplete');
  }
  return {
    id: c.id,
    name,
    ticker,
    description,
    recommendedPairAddress,
    recommendedPairSymbol,
    pairRationale,
    imageDirection,
    pairEnabled: c.pairEnabled !== false,
  };
}

/**
 * Funnel V2 — create draft, mark artwork pending, return immediately.
 * Exactly one image generates in `after()` without blocking navigation.
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
        launchAssistRateKey('artwork', ip, access.session),
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
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }

    if (
      body.headline != null ||
      body.articleText != null ||
      body.description != null ||
      body.prompt != null ||
      body.imagePrompt != null ||
      body.systemPrompt != null
    ) {
      throw new ValidationError(
        'Only providerArticleId and concept are accepted — prompts and article text are server-owned',
      );
    }

    const providerArticleId = String(body.providerArticleId ?? '').trim();
    if (!providerArticleId) {
      throw new ValidationError('providerArticleId is required');
    }
    if (providerArticleId.length > 128) {
      throw new ValidationError('Invalid providerArticleId');
    }

    const publicConcept = parseConcept(body.concept);
    if (!publicConcept.pairEnabled) {
      throw new ValidationError('Selected concept pair is no longer enabled');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = createPool(databaseUrl);
    const concept = toLaunchConceptInput(publicConcept);

    const draft = await createNewsLaunchDraft(
      { providerArticleId, concept },
      { db: pool },
    );
    await markDraftArtworkPending(draft.id, { db: pool });

    const draftId = draft.id;
    const bgUrl = databaseUrl;

    after(async () => {
      const bgPool = createPool(bgUrl);
      try {
        await generateSingleDraftArtwork(draftId, { db: bgPool });
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'info',
            message: 'async artwork ready',
            draftId,
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            message: 'async artwork failed',
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

    const payload = {
      draftId,
      artworkStatus: 'pending' as const,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 });
    }
    if (error instanceof ConceptValidationError) {
      const msg = error.message.startsWith('Article not found')
        ? 'Article not found'
        : 'Could not start artwork for this idea.';
      return NextResponse.json({ error: msg, code: 'ARTWORK_FAILED' }, { status: 400 });
    }
    console.error(
      'POST /api/launch-assist/artwork/start',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json(
      { error: 'Could not start artwork for this idea.', code: 'ERROR' },
      { status: 500 },
    );
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
