import { NextResponse } from 'next/server';
import {
  NONCE_COOKIE,
  createNonce,
  sealNonce,
  sessionCookieOptions,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const nonce = createNonce();
    const sealed = sealNonce(nonce);
    const res = NextResponse.json({ nonce });
    res.cookies.set(NONCE_COOKIE, sealed, sessionCookieOptions(10 * 60));
    return res;
  } catch (error) {
    console.error(
      'GET /api/auth/nonce',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ error: 'Could not create nonce' }, { status: 500 });
  }
}
