import { NextResponse } from 'next/server';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import {
  getIndexerMainCheckpointBlock,
  getPumpTrades,
  getTrades,
  listLiveTradesByToken,
  mergeLiveTrades,
  serverDb,
  type TradeSide,
} from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseLimit,
  parseOffset,
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
    const sideRaw = url.searchParams.get('side');
    if (sideRaw != null && sideRaw !== '' && sideRaw !== 'buy' && sideRaw !== 'sell') {
      throw new ValidationError('Invalid side');
    }
    const limit = parseLimit(url.searchParams.get('limit'));
    const offset = parseOffset(url.searchParams.get('offset'));
    const db = serverDb();

    if (chainId === SOLANA_MAINNET_CHAIN_ID) {
      const items = await getPumpTrades(db, address, {
        limit,
        offset,
        side: sideRaw ? (sideRaw as TradeSide) : undefined,
      });
      const body = { items };
      assertNoSecretLeakage(body);
      return NextResponse.json(body);
    }

    const [canonical, live, checkpoint] = await Promise.all([
      getTrades(db, chainId, address, {
        limit,
        offset,
        side: sideRaw ? (sideRaw as TradeSide) : undefined,
        beforeTimestamp: parseOptionalInt(
          url.searchParams.get('beforeTimestamp'),
          'beforeTimestamp',
        ),
        beforeLogIndex: parseOptionalInt(
          url.searchParams.get('beforeLogIndex'),
          'beforeLogIndex',
        ),
      }),
      listLiveTradesByToken(db, chainId, address).catch(() => []),
      getIndexerMainCheckpointBlock(db, chainId).catch(() => null),
    ]);
    const side = sideRaw as TradeSide | null;
    const items = mergeLiveTrades(
      canonical,
      side ? live.filter((trade) => trade.side === side) : live,
      checkpoint,
    ).slice(0, limit);
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
