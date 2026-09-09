import { NextResponse } from 'next/server';
import {
  buildManualTokenDisplayImagePath,
  createSupabaseTokenImageStorage,
  validateTokenDisplayImage,
} from '@scoop/news';
import { readSessionFromRequest } from '@/lib/auth/session';
import {
  createLaunchArtworkPinner,
  isPinataConfigured,
} from '@/lib/launch/ipfs-pinata';
import { IpfsPinNotConfiguredError } from '@/lib/launch/ipfs';
import { isProtocolIpfsImageUri } from '@/lib/launch/protocol-metadata';
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
  persistDisplayCopy?: unknown;
  displayCopyOnly?: unknown;
  existingIpfsUri?: unknown;
};

/**
 * Pin selected launch artwork once.
 * Optional: persist same bytes to public token-image (manual uploads).
 * Auth: SIWE session in production; development may proceed without session.
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
    const persistDisplayCopy = body.persistDisplayCopy === true;
    const displayCopyOnly = body.displayCopyOnly === true;
    const existingIpfsUri =
      typeof body.existingIpfsUri === 'string' ? body.existingIpfsUri.trim() : '';

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

    let bytes: Buffer;
    try {
      bytes = Buffer.from(b64, 'base64');
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

    let ipfsUri = existingIpfsUri;
    let cid: string | undefined;

    if (!displayCopyOnly) {
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
      const pinner = createLaunchArtworkPinner();
      const result = await pinner.pinArtwork({
        bytes: new Uint8Array(bytes),
        mimeType,
        fileName,
      });
      ipfsUri = result.ipfsUri;
      cid = result.cid;
    } else {
      if (!isProtocolIpfsImageUri(existingIpfsUri)) {
        return NextResponse.json(
          { ok: false, error: 'existingIpfsUri required for displayCopyOnly', code: 'VALIDATION' },
          { status: 400 },
        );
      }
      ipfsUri = existingIpfsUri;
    }

    let displayImagePath: string | null = null;
    if (persistDisplayCopy) {
      try {
        validateTokenDisplayImage({ bytes, mimeType });
        const path = buildManualTokenDisplayImagePath({ bytes, mimeType });
        const storage = createSupabaseTokenImageStorage();
        const uploaded = await storage.uploadDisplayCopy({
          path,
          bytes,
          mimeType,
        });
        displayImagePath = uploaded.path;
      } catch (err) {
        // Non-fatal: IPFS canonical pin remains; token page may use gateway.
        console.warn(
          '[launch-pin] token-image display copy failed',
          err instanceof Error ? err.message : err,
        );
      }
    }

    const payload = {
      ok: true as const,
      ipfsUri,
      cid,
      displayImagePath,
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
