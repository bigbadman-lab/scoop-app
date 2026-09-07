import { NextResponse } from 'next/server';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import {
  resolveSiweExpectedDomain,
  resolveSiweExpectedUri,
  verifySiweSignature,
} from '@/lib/auth/siwe';
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
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid JSON body');
    }

    // Reject forge-by-address: identity comes only from verified signature.
    if (body.address != null && body.message == null) {
      throw new ValidationError('Address alone cannot authenticate');
    }

    const message = String(body.message ?? '');
    const signature = String(body.signature ?? '');
    if (!message || !signature) {
      throw new ValidationError('message and signature are required');
    }

    const sealedNonce = parseCookieHeader(
      request.headers.get('cookie'),
      NONCE_COOKIE,
    );
    const expectedNonce = unsealNonce(sealedNonce);
    if (!expectedNonce) {
      throw new ValidationError('Nonce missing or expired — request a new one');
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
      return NextResponse.json(
        { error: 'Signature verification failed', code: 'VERIFY_FAILED' },
        { status: 401 },
      );
    }

    const session = createSession(verified.address, verified.chainId);
    if (!session) {
      throw new ValidationError('Could not create session');
    }

    const res = NextResponse.json({
      authenticated: true,
      address: session.address,
      chainId: session.chainId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
    res.cookies.set(
      SESSION_COOKIE,
      sealSession(session),
      sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)),
    );
    // Consume nonce — prevent replay.
    res.cookies.set(NONCE_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
    return res;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 });
    }
    console.error(
      'POST /api/auth/verify',
      error instanceof Error ? error.message.replace(/0x[a-fA-F0-9]{64,}/g, '[SIG]') : 'error',
    );
    return NextResponse.json({ error: 'Authentication failed', code: 'ERROR' }, { status: 500 });
  }
}
