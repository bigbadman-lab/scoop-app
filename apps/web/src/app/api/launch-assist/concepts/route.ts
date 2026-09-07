import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import {
  ConceptValidationError,
  generateLaunchConcepts,
  getNewsArticleForConcepts,
} from '@scoop/news';
import { resolveLaunchAssistAccess } from '@/lib/launch-assist/access';
import {
  LAUNCH_ASSIST_RATE_LIMIT,
  toPublicLaunchConcept,
  type LaunchAssistArticle,
} from '@/lib/launch-assist/types';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import {
  ValidationError,
  assertNoSecretLeakage,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  providerArticleId?: unknown;
  /** Rejected — article text must never be client-supplied. */
  headline?: unknown;
  description?: unknown;
  articleText?: unknown;
};

/**
 * Product-facing concept generation.
 * Reuses generateLaunchConcepts. Does not expose /api/internal/*.
 */
export async function POST(request: Request) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    const access = resolveLaunchAssistAccess();
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
        `launch-assist:${ip}`,
        LAUNCH_ASSIST_RATE_LIMIT.windowMs,
        LAUNCH_ASSIST_RATE_LIMIT.maxHits,
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

    // Reject any attempt to inject article content from the client.
    if (
      body.headline != null ||
      body.description != null ||
      body.articleText != null
    ) {
      throw new ValidationError(
        'Only providerArticleId is accepted — article content is loaded server-side',
      );
    }

    const providerArticleId = String(body.providerArticleId ?? '').trim();
    if (!providerArticleId) {
      throw new ValidationError('providerArticleId is required');
    }
    if (providerArticleId.length > 128) {
      throw new ValidationError('Invalid providerArticleId');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = createPool(databaseUrl);
    const articleCtx = await getNewsArticleForConcepts(pool, providerArticleId);
    if (!articleCtx) {
      throw new ValidationError('Article not found');
    }

    const urlRow = await pool.query<{ url: string }>(
      `SELECT url FROM provider_news_articles
       WHERE provider = 'tiingo' AND provider_article_id = $1
       LIMIT 1`,
      [providerArticleId],
    );
    const articleUrl = urlRow.rows[0]?.url?.trim() ?? '';

    const result = await generateLaunchConcepts(
      { providerArticleId },
      { db: pool, article: articleCtx },
    );

    const catalogue = await loadEnabledQuoteCatalogue();
    const enabledAddresses = new Set(
      catalogue.map((q) => q.quoteAsset.toLowerCase()),
    );

    const concepts = result.response.concepts.map((c) =>
      toPublicLaunchConcept(c, enabledAddresses),
    );
    if (concepts.length !== 3) {
      throw new Error('Concept generation returned unexpected count');
    }

    const article: LaunchAssistArticle = {
      providerArticleId: articleCtx.providerArticleId,
      headline: articleCtx.headline,
      sourceDomain: articleCtx.sourceDomain,
      publishedAt: articleCtx.publishedAt,
      url: articleUrl,
    };

    const payload = {
      article,
      concepts,
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
        : 'Could not generate launch concepts for this story.';
      return NextResponse.json({ error: msg, code: 'CONCEPT_FAILED' }, { status: 400 });
    }
    console.error(
      'POST /api/launch-assist/concepts',
      error instanceof Error
        ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]')
        : 'error',
    );
    return NextResponse.json(
      { error: 'Could not generate launch concepts for this story.', code: 'ERROR' },
      { status: 500 },
    );
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
