import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import { generateLaunchConcepts, ConceptValidationError } from '@scoop/news';
import {
  ValidationError,
  assertNoSecretLeakage,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Simple in-memory rate guard (per process). */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const prev = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_HITS) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  return true;
}

function assertInternalAccess(request: Request): void {
  const secret = (process.env.SCOOP_INTERNAL_API_SECRET ?? '').trim();
  const header = request.headers.get('x-scoop-internal-secret') ?? '';
  const isDev = process.env.NODE_ENV === 'development';

  if (secret) {
    if (header !== secret) {
      throw new ValidationError('Unauthorized');
    }
    return;
  }

  // No secret configured: only allow local development.
  if (!isDev) {
    throw new ValidationError(
      'Internal concepts route disabled — set SCOOP_INTERNAL_API_SECRET',
    );
  }
}

export async function POST(request: Request) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    assertInternalAccess(request);

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'local';
    if (!rateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }
    const providerArticleId = String(
      (body as { providerArticleId?: unknown }).providerArticleId ?? '',
    ).trim();
    if (!providerArticleId) {
      throw new ValidationError('providerArticleId is required');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = createPool(databaseUrl);
    const result = await generateLaunchConcepts(
      { providerArticleId },
      { db: pool },
    );

    const payload = {
      article: result.response.article,
      concepts: result.response.concepts,
      availablePairs: result.enabledQuotes.map((q) => ({
        symbol: q.symbol,
        address: q.address,
        quoteType: q.quoteType,
      })),
      usage: {
        model: result.usage.model,
        latencyMs: result.usage.latencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        repairAttempted: result.usage.repairAttempted,
      },
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
      'POST /api/internal/news/concepts',
      error instanceof Error ? error.message.replace(/sk-[a-zA-Z0-9._-]+/g, '[REDACTED]') : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
