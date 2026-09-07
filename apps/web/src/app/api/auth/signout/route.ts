import { NextResponse } from 'next/server';
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const clear = { ...sessionCookieOptions(0), maxAge: 0 };
  res.cookies.set(SESSION_COOKIE, '', clear);
  res.cookies.set(NONCE_COOKIE, '', clear);
  return res;
}
