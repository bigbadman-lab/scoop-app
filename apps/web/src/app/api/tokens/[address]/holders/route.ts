import { NextResponse } from 'next/server';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import { getHolders, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseLimit,
  parseOffset,
  parseTokenApiAddress,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
) {
  try {
    const { address: raw } = await context.params;
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const address = parseTokenApiAddress(raw, chainId);

    // Pump holder indexing deferred — never 500 / never EVM-normalize Solana mints.
    if (chainId === SOLANA_MAINNET_CHAIN_ID) {
      const body = { items: [] as const, deferred: true as const };
      assertNoSecretLeakage(body);
      return NextResponse.json(body);
    }

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
