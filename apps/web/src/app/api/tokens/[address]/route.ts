import { NextResponse } from 'next/server';
import { getToken, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
) {
  try {
    const { address: raw } = await context.params;
    const address = parseAddress(raw);
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));

    const token = await getToken(serverDb(), chainId, address);
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    assertNoSecretLeakage(token);
    return NextResponse.json({ token });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens/[address]', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
