import { NextResponse } from 'next/server';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import {
  assertCandleInterval,
  getCandles,
  getPumpCandles,
  serverDb,
} from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseLimit,
  parseOptionalInt,
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
    const interval = url.searchParams.get('interval') ?? '1m';
    const db = serverDb();

    if (chainId === SOLANA_MAINNET_CHAIN_ID) {
      if (interval !== '1m' && interval !== '5m' && interval !== '1h') {
        throw new ValidationError('Invalid interval');
      }
      const items = await getPumpCandles(db, address, interval, {
        from: parseOptionalInt(url.searchParams.get('from'), 'from'),
        to: parseOptionalInt(url.searchParams.get('to'), 'to'),
        limit: parseLimit(url.searchParams.get('limit'), 500, 100),
      });
      const body = { items };
      assertNoSecretLeakage(body);
      return NextResponse.json(body);
    }

    try {
      assertCandleInterval(interval);
    } catch {
      throw new ValidationError('Invalid interval');
    }
    const items = await getCandles(db, chainId, address, interval, {
      from: parseOptionalInt(url.searchParams.get('from'), 'from'),
      to: parseOptionalInt(url.searchParams.get('to'), 'to'),
      limit: parseLimit(url.searchParams.get('limit'), 500, 100),
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
