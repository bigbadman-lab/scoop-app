import { NextResponse } from 'next/server';
import { assertCandleInterval, getCandles, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
  parseChainId,
  parseLimit,
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
    const interval = url.searchParams.get('interval') ?? '1m';
    try {
      assertCandleInterval(interval);
    } catch {
      throw new ValidationError('Invalid interval');
    }
    const items = await getCandles(serverDb(), chainId, address, interval, {
      from: parseOptionalInt(url.searchParams.get('from'), 'from'),
      to: parseOptionalInt(url.searchParams.get('to'), 'to'),
      limit: parseLimit(url.searchParams.get('limit'), 100, 100),
    });
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens/[address]/candles', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
