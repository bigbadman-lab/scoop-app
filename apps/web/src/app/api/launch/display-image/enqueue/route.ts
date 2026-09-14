import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/session';
import { recordDisplayFinalizeIntent } from '@/lib/launch/record-display-finalize-intent';
import { serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
} from '@/lib/server/validate';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';
import { SCOOP_CHAIN_ID } from '@scoop/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

type Body = {
  imageUri?: unknown;
  draftId?: unknown;
  displayImagePath?: unknown;
  chainId?: unknown;
  tokenAddress?: unknown;
};

/**
 * Fast pin-reuse enqueue for server-owned display finalization.
 * Does not wait for indexing or apply display URL.
 */
export async function POST(request: Request) {
  try {
    const session = readSessionFromRequest(request);
    if (!session && process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { ok: false, error: 'Sign in required', code: 'AUTH_REQUIRED' },
        { status: 401 },
      );
    }

    const ip = clientIp(request);
    const key = `launch-display-enqueue:${session?.address ?? 'anon'}:${ip}`;
    if (!rateLimitInternal(key, 60_000, 40)) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts', code: 'RATE_LIMIT' },
        { status: 429 },
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const imageUri =
      typeof body.imageUri === 'string' ? body.imageUri.trim() : '';
    const draftId =
      typeof body.draftId === 'string' ? body.draftId.trim() : '';
    const displayImagePath =
      typeof body.displayImagePath === 'string'
        ? body.displayImagePath.trim().replace(/^\/+/, '')
        : '';
    const chainIdRaw =
      typeof body.chainId === 'number' ? body.chainId : Number(body.chainId);
    const chainId =
      Number.isInteger(chainIdRaw) && chainIdRaw === SCOOP_CHAIN_ID
        ? chainIdRaw
        : null;
    let tokenAddress: string | null = null;
    if (typeof body.tokenAddress === 'string' && body.tokenAddress.trim()) {
      tokenAddress = parseAddress(body.tokenAddress.trim());
    }

    if (!imageUri) {
      throw new ValidationError('imageUri required');
    }

    const recorded = await recordDisplayFinalizeIntent({
      db: serverDb(),
      imageUri,
      draftId: draftId || null,
      displayImagePath: displayImagePath || null,
      chainId,
      tokenAddress,
    });
    if (!recorded.ok) {
      throw new ValidationError(recorded.error);
    }

    const payload = { ok: true as const, intentId: recorded.intentId };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'VALIDATION' },
        { status: 400 },
      );
    }
    console.error(
      'POST /api/launch/display-image/enqueue',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      { ok: false, error: 'unavailable', code: 'ERROR' },
      { status: 503 },
    );
  }
}
