import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import {
  getDiscoverBoard,
  listLiveTips,
  mergeLiveDiscoveryItems,
  serverDb,
} from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

/**
 * Homepage Discover snapshot — NEW + BONDING + TRENDING in one response.
 * One HTTP request per live refresh cycle.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId') ?? String(SCOOP_CHAIN_ID));

    const db = serverDb();
    const [board, liveTips] = await Promise.all([
      getDiscoverBoard(db, { chainId }),
      listLiveTips(db, chainId).catch(() => []),
    ]);
    const tipsFor = (items: typeof board.new) => {
      const addresses = new Set(items.map((item) => item.tokenAddress.toLowerCase()));
      return liveTips.filter((tip) => addresses.has(tip.tokenAddress.toLowerCase()));
    };
    const body = {
      new: mergeLiveDiscoveryItems(board.new, liveTips),
      bonding: mergeLiveDiscoveryItems(board.bonding, tipsFor(board.bonding)),
      trending: mergeLiveDiscoveryItems(board.trending, tipsFor(board.trending)),
    };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/discover', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
