import { NextResponse } from 'next/server';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { buildMarketsBoardItems } from '@/lib/markets/types';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { getActiveMarkets, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

/**
 * Complete active market set for `/markets`, ranked by FDV.
 * One response per live refresh — no product-level truncation.
 * Not homepage Discover (`limit=24` / `/api/tokens`).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId') ?? String(SCOOP_CHAIN_ID));

    const [tokens, catalogue] = await Promise.all([
      getActiveMarkets(serverDb(), { chainId }),
      loadEnabledQuoteCatalogue().catch(() => []),
    ]);

    const items = buildMarketsBoardItems(tokens, catalogue);
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/markets', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
