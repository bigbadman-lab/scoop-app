import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/session';
import {
  createLaunchArtworkPinner,
  isPinataConfigured,
} from '@/lib/launch/ipfs-pinata';
import { IpfsPinNotConfiguredError } from '@/lib/launch/ipfs';
import { META_LIMITS } from '@/lib/launch/types';
import { assertNoSecretLeakage } from '@/lib/server/validate';
import { clientIp, rateLimitInternal } from '@/lib/server/internal-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

type Body = {
  bytesBase64?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
};

/**
 * Pin selected launch artwork once.
 * Auth: SIWE session in production; development may proceed without session.
 * Never accepts NEXT_PUBLIC credentials — uses PINATA_JWT server-side.
 */
export async function POST(request: Request) {
  try {
    const session = readSessionFromRequest(request);
    if (!session && process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { ok: false, error: 'Sign in with your wallet to pin artwork.', code: 'AUTH_REQUIRED' },
        { status: 401 },
      );
    }

    const ip = clientIp(request);
    const key = `launch-pin:${session?.address ?? 'anon'}:${ip}`;
    if (!rateLimitInternal(key, 60_000, 10)) {
      return NextResponse.json(
        { ok: false, error: 'Too many pin attempts. Try again shortly.', code: 'RATE_LIMIT' },
        { status: 429 },
      );
    }

    if (!isPinataConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'IPFS pinning is not configured (PINATA_JWT).',
          code: 'PIN_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const mimeType =
      typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
    const fileName =
      typeof body.fileName === 'string' ? body.fileName.trim() : undefined;
    const b64 =
      typeof body.bytesBase64 === 'string' ? body.bytesBase64.trim() : '';

    if (!b64) {
      return NextResponse.json(
        { ok: false, error: 'bytesBase64 required', code: 'VALIDATION' },
        { status: 400 },
      );
    }
    if (!(META_LIMITS.imageMime as readonly string[]).includes(mimeType)) {
      return NextResponse.json(
        { ok: false, error: 'mimeType must be PNG, JPEG, or WebP', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid base64 artwork', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    if (bytes.byteLength === 0 || bytes.byteLength > META_LIMITS.imageFileMaxBytes) {
      return NextResponse.json(
        { ok: false, error: 'Artwork size is invalid', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    const pinner = createLaunchArtworkPinner();
    const result = await pinner.pinArtwork({
      bytes,
      mimeType,
      fileName,
    });

    const payload = {
      ok: true as const,
      ipfsUri: result.ipfsUri,
      cid: result.cid,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof IpfsPinNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'PIN_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    console.error(
      'POST /api/launch/artwork/pin',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Pin failed',
        code: 'ERROR',
      },
      { status: 503 },
    );
  }
}
