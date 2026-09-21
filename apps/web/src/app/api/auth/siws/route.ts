import { NextResponse } from 'next/server';
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSiwsSession,
  parseCookieHeader,
  sealSession,
  sessionCookieOptions,
  unsealNonce,
} from '@/lib/auth/session';
import {
  resolveSiweExpectedDomain,
  resolveSiweExpectedUri,
} from '@/lib/auth/siwe-challenge';
import { verifySiwsSignature } from '@/lib/auth/siws-verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  message?: unknown;
  signature?: unknown;
  address?: unknown;
  userId?: unknown;
};

function clearNonceCookie(res: NextResponse): void {
  res.cookies.set(NONCE_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
}

function errorJson(status: number, code: string, error: string): NextResponse {
  const res = NextResponse.json({ ok: false, error, code }, { status });
  clearNonceCookie(res);
  return res;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') {
      return errorJson(400, 'VALIDATION', 'Invalid JSON body');
    }
    if (body.address != null && body.message == null) {
      return errorJson(400, 'VALIDATION', 'Address alone cannot authenticate');
    }
    if (body.userId != null) {
      return errorJson(400, 'VALIDATION', 'userId cannot be supplied by the client');
    }

    const message = String(body.message ?? '');
    const signature = String(body.signature ?? '');
    if (!message || !signature) {
      return errorJson(400, 'VALIDATION', 'message and signature are required');
    }

    const sealedNonce = parseCookieHeader(request.headers.get('cookie'), NONCE_COOKIE);
    const expectedNonce = unsealNonce(sealedNonce);
    if (!expectedNonce) {
      return errorJson(400, 'NONCE_ERROR', 'Nonce missing or expired — request a new one');
    }

    const verified = verifySiwsSignature({
      message,
      signature,
      expectedNonce,
      expectedDomain: resolveSiweExpectedDomain(request),
      expectedUri: resolveSiweExpectedUri(request),
    });
    if (!verified) {
      return errorJson(401, 'SIWS_VERIFY_FAILED', 'Signature verification failed');
    }

    const session = createSiwsSession(verified.address);
    if (!session) {
      return errorJson(500, 'SESSION_CREATE_FAILED', 'Could not create session');
    }

    const res = NextResponse.json({
      ok: true,
      authenticated: true,
      userId: session.userId,
      address: session.address,
      chainId: session.chainId,
      namespace: session.namespace,
      authMethod: session.authMethod,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
    res.cookies.set(
      SESSION_COOKIE,
      sealSession(session),
      sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)),
    );
    clearNonceCookie(res);
    return res;
  } catch (error) {
    console.error(
      'POST /api/auth/siws',
      error instanceof Error ? error.message.slice(0, 180) : 'error',
    );
    return errorJson(500, 'ERROR', 'Authentication failed');
  }
}
