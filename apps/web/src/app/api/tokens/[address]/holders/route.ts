import { NextResponse } from 'next/server';
import { getHolders, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
  parseChainId,
  parseLimit,
  parseOffset,
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
    const retailOnly = url.searchParams.get('retailOnly') === 'true';
    const items = await getHolders(serverDb(), chainId, address, {
      retailOnly,
      limit: parseLimit(url.searchParams.get('limit')),
      offset: parseOffset(url.searchParams.get('offset')),
    });
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens/[address]/holders', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
