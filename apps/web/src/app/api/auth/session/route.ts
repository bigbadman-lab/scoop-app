import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    address: session.address,
    chainId: session.chainId,
    namespace: session.namespace,
    authMethod: session.authMethod,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
}
