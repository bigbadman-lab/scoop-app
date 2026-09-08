import { NextResponse } from 'next/server';
import { loadAuthenticatedAccount } from '@/lib/account/load-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const result = await loadAuthenticatedAccount(request);
  if (!result.ok) {
    return NextResponse.json(
      { authenticated: false, code: result.code, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.account);
}
