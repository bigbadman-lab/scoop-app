import { NextResponse } from 'next/server';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import {
  resolveSiweExpectedDomain,
  resolveSiweExpectedUri,
  verifySiweSignature,
} from '@/lib/auth/siwe';
import { resolveVerifiedWalletIdentity } from '@/lib/auth/identity';
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  parseCookieHeader,
  sealSession,
  sessionCookieOptions,
  unsealNonce,
} from '@/lib/auth/session';
import { ValidationError } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  message?: unknown;
  signature?: unknown;
  address?: unknown;
  userId?: unknown;
  /** Metadata only — never authorization. */
  walletType?: unknown;
  provider?: unknown;
};

function clearNonceCookie(res: NextResponse): void {
  res.cookies.set(NONCE_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
}

function errorJson(
  status: number,
  code: string,
  error: string,
): NextResponse {
  const res = NextResponse.json({ ok: false, error, code }, { status });
  // Consume nonce on every failed verify attempt so the next SIWE must fetch a fresh one.
  clearNonceCookie(res);
  return res;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') {
      return errorJson(400, 'VALIDATION', 'Invalid JSON body');
    }

    // Reject forge-by-address: identity comes only from verified signature.
    if (body.address != null && body.message == null) {
      return errorJson(400, 'VALIDATION', 'Address alone cannot authenticate');
    }
    // Never trust client-supplied userId.
    if (body.userId != null) {
      return errorJson(400, 'VALIDATION', 'userId cannot be supplied by the client');
    }

    const message = String(body.message ?? '');
    const signature = String(body.signature ?? '');
    if (!message || !signature) {
      return errorJson(400, 'VALIDATION', 'message and signature are required');
    }

    const sealedNonce = parseCookieHeader(
      request.headers.get('cookie'),
      NONCE_COOKIE,
    );
    const expectedNonce = unsealNonce(sealedNonce);
    if (!expectedNonce) {
      return errorJson(400, 'NONCE_ERROR', 'Nonce missing or expired — request a new one');
    }

    const expectedDomain = resolveSiweExpectedDomain(request);
    const expectedUri = resolveSiweExpectedUri(request);
    const verified = await verifySiweSignature({
      message,
      signature,
      expectedNonce,
      expectedDomain,
      expectedUri,
      expectedChainId: ROBINHOOD_CHAIN_ID,
    });
    if (!verified) {
      return errorJson(401, 'SIWE_VERIFY_FAILED', 'Signature verification failed');
    }

    let identity;
    try {
      const walletType =
        body.walletType === 'embedded' || body.walletType === 'external'
          ? body.walletType
          : undefined;
      const provider =
        body.provider === 'injected' ||
        body.provider === 'walletconnect' ||
        body.provider === 'reown_email' ||
        body.provider === 'auth' ||
        body.provider === 'unknown'
          ? body.provider
          : undefined;
      identity = await resolveVerifiedWalletIdentity({
        address: verified.address,
        chainId: verified.chainId,
        walletType,
        provider,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'SCOOP_USER_DISABLED') {
        return errorJson(403, 'USER_DISABLED', 'Account disabled');
      }
      console.error(
        'POST /api/auth/verify identity',
        error instanceof Error ? error.message.replace(/0x[a-fA-F0-9]{40,}/gi, '[ADDR]') : 'error',
      );
      return errorJson(500, 'IDENTITY_RESOLUTION_FAILED', 'Could not resolve account');
    }

    const session = createSession(identity.userId, identity.address, verified.chainId);
    if (!session) {
      return errorJson(500, 'SESSION_CREATE_FAILED', 'Could not create session');
    }

    // Existing scoop_session (if any) is replaced by writing the same cookie name/path.
    const res = NextResponse.json({
      ok: true,
      authenticated: true,
      userId: session.userId,
      address: session.address,
      chainId: session.chainId,
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
    if (error instanceof ValidationError) {
      return errorJson(400, 'VALIDATION', error.message);
    }
    console.error(
      'POST /api/auth/verify',
      error instanceof Error ? error.message.replace(/0x[a-fA-F0-9]{64,}/g, '[SIG]') : 'error',
    );
    return errorJson(500, 'ERROR', 'Authentication failed');
  }
}
