import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import { getDualRailDiscoverBoard } from '@/lib/discovery/dual-rail';
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
 * Default (no chainId): dual-rail RHC + Solana/Pump NEW.
 * Explicit chainId: single-rail (legacy clients).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawChain = url.searchParams.get('chainId');
    const db = serverDb();

    if (rawChain == null || rawChain.trim() === '') {
      const board = await getDualRailDiscoverBoard(db);
      const [rhcTips, solTips] = await Promise.all([
        listLiveTips(db, SCOOP_CHAIN_ID).catch(() => []),
        listLiveTips(db, SOLANA_MAINNET_CHAIN_ID).catch(() => []),
      ]);
      const liveTips = [...rhcTips, ...solTips];
      const tipsFor = (items: typeof board.new) => {
        const keys = new Set(
          items.map((item) => `${item.chainId}:${item.tokenAddress}`),
        );
        return liveTips.filter((tip) =>
          keys.has(`${tip.chainId}:${tip.tokenAddress}`),
        );
      };
      const body = {
        new: mergeLiveDiscoveryItems(board.new, liveTips),
        bonding: mergeLiveDiscoveryItems(board.bonding, tipsFor(board.bonding)),
        trending: mergeLiveDiscoveryItems(
          board.trending,
          tipsFor(board.trending),
        ),
      };
      assertNoSecretLeakage(body);
      return NextResponse.json(body);
    }

    const chainId = parseChainId(rawChain);
    const [board, liveTips] = await Promise.all([
      getDiscoverBoard(db, { chainId }),
      listLiveTips(db, chainId).catch(() => []),
    ]);
    const tipsFor = (items: typeof board.new) => {
      const addresses = new Set(
        items.map((item) =>
          item.tokenAddress.startsWith('0x')
            ? item.tokenAddress.toLowerCase()
            : item.tokenAddress,
        ),
      );
      return liveTips.filter((tip) => {
        const key = tip.tokenAddress.startsWith('0x')
          ? tip.tokenAddress.toLowerCase()
          : tip.tokenAddress;
        return addresses.has(key);
      });
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
    console.error(
      'GET /api/discover',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
