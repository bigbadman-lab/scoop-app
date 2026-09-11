import { SCOOP_CHAIN_ID } from '@/lib/quotes/catalogue';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { buildMarketsBoardItems, type MarketsBoardSnapshot } from '@/lib/markets/types';
import { getActiveMarkets, serverDb } from '@/lib/server/queries';

async function loadCatalogueSafe() {
  try {
    return await loadEnabledQuoteCatalogue();
  } catch (error) {
    console.error('[markets] quote catalogue load failed:', error);
    return [];
  }
}

/**
 * Server snapshot for `/markets`.
 * Active markets = all indexed launches for the chain (uncapped `getActiveMarkets`).
 */
export async function loadMarketsBoard(): Promise<MarketsBoardSnapshot> {
  const catalogue = await loadCatalogueSafe();

  try {
    const tokens = await getActiveMarkets(serverDb(), {
      chainId: SCOOP_CHAIN_ID,
    });
    const items = buildMarketsBoardItems(tokens, catalogue);
    if (items.length === 0) {
      return {
        status: 'empty',
        items: [],
        updatedAt: Date.now(),
        message: 'No active markets yet.',
      };
    }
    return { status: 'ok', items, updatedAt: Date.now() };
  } catch (error) {
    console.error(
      '[markets] load failed:',
      error instanceof Error ? error.message : 'error',
    );
    return {
      status: 'error',
      items: [],
      updatedAt: null,
      message: 'Could not load markets. Try again.',
    };
  }
}
