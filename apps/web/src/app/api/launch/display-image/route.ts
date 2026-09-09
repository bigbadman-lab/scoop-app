import { NextResponse } from 'next/server';
import {
  applyDisplayImagePathToToken,
  applyDraftDisplayImageToToken,
} from '@scoop/db';
import {
  deriveTokenImagePublicUrl,
  isAllowedTokenDisplayImagePath,
} from '@scoop/news';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { readSessionFromRequest } from '@/lib/auth/session';
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

type Body = {
  chainId?: unknown;
  tokenAddress?: unknown;
  draftId?: unknown;
  displayImagePath?: unknown;
};

/**
 * Finalize tokens.display_image_url after canonical indexed launch.
 * Never trusts client-supplied displayImageUrl — only draft DB state or allowlisted path.
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

    if (!displayImagePath && !draftId) {
      return NextResponse.json(
        { ok: true, status: 'noop' as const },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const db = serverDb();

    // Manual / pin path wins — never apply draft artwork over selected manual bytes.
    if (displayImagePath) {
      if (!isAllowedTokenDisplayImagePath(displayImagePath)) {
        throw new ValidationError('Invalid displayImagePath');
      }
      const origin = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
        .trim()
        .replace(/\/$/, '');
      if (!origin) {
        return NextResponse.json(
          { ok: false, error: 'Display storage not configured', code: 'CONFIG' },
          { status: 503 },
        );
      }
      const publicUrl = deriveTokenImagePublicUrl(origin, displayImagePath);
      const result = await applyDisplayImagePathToToken(db, {
        chainId,
        tokenAddress,
        displayImageUrl: publicUrl,
      });
      if (result === 'missing_token') {
        return NextResponse.json(
          { ok: false, error: 'launch_not_indexed', code: 'NOT_INDEXED' },
          { status: 409 },
        );
      }
      const payload = { ok: true as const, status: result };
      assertNoSecretLeakage(payload);
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const applied = await applyDraftDisplayImageToToken(db, {
      chainId,
      tokenAddress,
      draftId,
    });
    if (!applied) {
      // Missing draft display copy or not yet indexed — non-fatal for caller.
      const payload = { ok: true as const, status: 'noop' as const };
      assertNoSecretLeakage(payload);
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const payload = { ok: true as const, status: 'applied' as const };
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
