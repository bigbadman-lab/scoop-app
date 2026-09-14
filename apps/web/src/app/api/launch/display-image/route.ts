import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { readSessionFromRequest } from '@/lib/auth/session';
import { finalizeTokenDisplayImage } from '@/lib/launch/finalize-token-display-image';
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
/** Allow bounded wait-for-index + IPFS mirror inside one request. */
export const maxDuration = 90;

type Body = {
  chainId?: unknown;
  tokenAddress?: unknown;
  draftId?: unknown;
  displayImagePath?: unknown;
  imageUri?: unknown;
  waitForIndex?: unknown;
};

/**
 * Durable finalize of tokens.display_image_url after launch.
 * Server-owned: path reuse → draft copy → IPFS→Supabase fallback.
 * Never trusts client-supplied displayImageUrl.
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
    const key = `launch-display:${session?.address ?? 'anon'}:${ip}`;
    if (!rateLimitInternal(key, 60_000, 30)) {
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
    const draftId =
      typeof body.draftId === 'string' ? body.draftId.trim() : '';
    const displayImagePath =
      typeof body.displayImagePath === 'string'
        ? body.displayImagePath.trim().replace(/^\/+/, '')
        : '';
    const imageUri =
      typeof body.imageUri === 'string' ? body.imageUri.trim() : '';
    const waitForIndex = body.waitForIndex !== false;

    if (!displayImagePath && !draftId && !imageUri) {
      return NextResponse.json(
        { ok: true, status: 'noop' as const, source: 'noop' as const },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (imageUri && !/^ipfs:\/\//i.test(imageUri) && imageUri.length > 0) {
      // Only canonical IPFS is accepted for server-side mirror (never arbitrary URLs).
      throw new ValidationError('imageUri must be an ipfs:// URI');
    }

    const result = await finalizeTokenDisplayImage({
      db: serverDb(),
      chainId,
      tokenAddress,
      displayImagePath: displayImagePath || null,
      draftId: displayImagePath ? null : draftId || null,
      imageUri: imageUri || null,
      waitForIndex,
    });

    if (!result.ok) {
      const status = result.error === 'launch_not_indexed' ? 409 : result.retryable ? 503 : 400;
      const code =
        result.error === 'launch_not_indexed'
          ? 'NOT_INDEXED'
          : result.retryable
            ? 'RETRYABLE'
            : 'FAILED';
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code,
          retryable: result.retryable,
          retries: result.retries,
          source: result.source,
        },
        { status, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const payload = {
      ok: true as const,
      status: result.status,
      source: result.source,
      uploaded: result.uploaded,
      retries: result.retries,
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
      'POST /api/launch/display-image',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      { ok: false, error: 'unavailable', code: 'ERROR' },
      { status: 503 },
    );
  }
}
