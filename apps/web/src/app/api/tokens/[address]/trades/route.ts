import { NextResponse } from 'next/server';
import { getTrades, serverDb, type TradeSide } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
  parseChainId,
  parseLimit,
  parseOffset,
  parseOptionalInt,
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
    const sideRaw = url.searchParams.get('side');
    if (sideRaw != null && sideRaw !== '' && sideRaw !== 'buy' && sideRaw !== 'sell') {
      throw new ValidationError('Invalid side');
    }
    const items = await getTrades(serverDb(), chainId, address, {
      limit: parseLimit(url.searchParams.get('limit')),
      offset: parseOffset(url.searchParams.get('offset')),
      side: sideRaw ? (sideRaw as TradeSide) : undefined,
      beforeTimestamp: parseOptionalInt(url.searchParams.get('beforeTimestamp'), 'beforeTimestamp'),
      beforeLogIndex: parseOptionalInt(url.searchParams.get('beforeLogIndex'), 'beforeLogIndex'),
    });
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens/[address]/trades', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
