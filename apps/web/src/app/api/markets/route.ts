import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import { getDualRailActiveMarkets } from '@/lib/discovery/dual-rail';
import { buildMarketsBoardItems } from '@/lib/markets/types';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import {
  getActiveMarkets,
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
 * Complete active market set for `/markets`, ranked by FDV.
 * Default (no chainId): dual-rail RHC + Solana/Pump.
 * Explicit chainId: single-rail.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawChain = url.searchParams.get('chainId');
    const db = serverDb();

    if (rawChain == null || rawChain.trim() === '') {
      const [tokens, rhcTips, solTips, catalogue] = await Promise.all([
        getDualRailActiveMarkets(db),
        listLiveTips(db, SCOOP_CHAIN_ID).catch(() => []),
        listLiveTips(db, SOLANA_MAINNET_CHAIN_ID).catch(() => []),
        loadEnabledQuoteCatalogue().catch(() => []),
      ]);
      const items = buildMarketsBoardItems(
        mergeLiveDiscoveryItems(tokens, [...rhcTips, ...solTips]),
        catalogue,
      );
      const body = { items };
      assertNoSecretLeakage(body);
      return NextResponse.json(body);
    }

    const chainId = parseChainId(rawChain);
    const [tokens, liveTips, catalogue] = await Promise.all([
      getActiveMarkets(db, { chainId }),
      listLiveTips(db, chainId).catch(() => []),
      loadEnabledQuoteCatalogue().catch(() => []),
    ]);

    const items = buildMarketsBoardItems(
      mergeLiveDiscoveryItems(tokens, liveTips),
      catalogue,
    );
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'GET /api/markets',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
