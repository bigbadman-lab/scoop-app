import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { readSessionFromRequest } from '@/lib/auth/session';
import { bindAndFinalizeTokenDisplayImage } from '@/lib/launch/bind-token-display-image';
import { serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
} from '@/lib/server/validate';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 30;

type Body = {
  chainId?: unknown;
  tokenAddress?: unknown;
  imageUri?: unknown;
  draftId?: unknown;
  displayImagePath?: unknown;
};

/**
 * Receipt-driven bind of a trusted finalize intent to the decoded token address.
 * Resolves display URL from intent path — never trusts client displayImageUrl.
 * Succeeds even when the canonical tokens row is not indexed yet.
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
    const key = `launch-display-bind:${session?.address ?? 'anon'}:${ip}`;
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

    const chainId =
      typeof body.chainId === 'number' ? body.chainId : Number(body.chainId);
    if (!Number.isInteger(chainId) || chainId !== SCOOP_CHAIN_ID) {
      throw new ValidationError('Unsupported chainId');
    }
    const tokenAddress = parseAddress(
      typeof body.tokenAddress === 'string' ? body.tokenAddress : '',
    );
    const imageUri =
      typeof body.imageUri === 'string' ? body.imageUri.trim() : '';
    const draftId =
      typeof body.draftId === 'string' ? body.draftId.trim() : '';
    const displayImagePath =
      typeof body.displayImagePath === 'string'
        ? body.displayImagePath.trim().replace(/^\/+/, '')
        : '';

    if (!imageUri) {
      throw new ValidationError('imageUri required');
    }
    if (!/^ipfs:\/\//i.test(imageUri)) {
      throw new ValidationError('imageUri must be an ipfs:// URI');
    }

    const result = await bindAndFinalizeTokenDisplayImage({
      db: serverDb(),
      chainId,
      tokenAddress,
      imageUri,
      draftId: draftId || null,
      displayImagePath: displayImagePath || null,
    });

    if (!result.ok) {
      const status =
        result.code === 'INTENT_NOT_FOUND' || result.code === 'PATH_MISSING'
          ? 409
          : result.retryable
            ? 503
            : 400;
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          retryable: result.retryable,
        },
        { status, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const payload = {
      ok: true as const,
      displayImageUrl: result.displayImageUrl,
      bound: result.bound,
      finalized: result.finalized,
      source: result.source,
      tokenRowPresent: result.tokenRowPresent,
    };
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
      'POST /api/launch/display-image/bind',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      { ok: false, error: 'unavailable', code: 'ERROR' },
      { status: 503 },
    );
  }
}
