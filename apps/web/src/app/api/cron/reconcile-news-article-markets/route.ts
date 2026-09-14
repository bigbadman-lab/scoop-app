import { NextResponse } from 'next/server';
import { assertInternalAccess, clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import { ValidationError } from '@/lib/server/validate';
import { reconcileNewsArticleMarkets } from '@/lib/news/reconcile-news-article-markets';
import { serverDb } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

function assertReconcileAccess(request: Request): void {
  const cronSecret = (process.env.CRON_SECRET ?? '').trim();
  const auth = request.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return;
  }
  if (request.headers.get('x-vercel-cron') === '1') {
    return;
  }
  assertInternalAccess(request);
}

export async function GET(request: Request) {
  try {
    assertReconcileAccess(request);
    const ip = clientIp(request);
    if (!rateLimitInternal(`reconcile-news-markets:${ip}`, 60_000, 30)) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts', code: 'RATE_LIMIT' },
        { status: 429 },
      );
    }

    const summary = await reconcileNewsArticleMarkets({ db: serverDb() });
    return NextResponse.json(
      { ok: true, ...summary },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    console.error(
      'GET /api/cron/reconcile-news-article-markets',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      { ok: false, error: 'unavailable', code: 'ERROR' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
