import type { TokenDiscoveryItem } from '@scoop/db';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  quoteCatalogueImageUrl,
  quoteDisplaySymbol,
} from '@/lib/quotes/resolve';
import { rankMarketsByFdv } from '@/lib/markets/rank';

/** Public board row — enough for list UI + ranking without N+1. */
export type MarketsBoardItem = {
  tokenAddress: string;
  name: string;
  symbol: string;
  imageUri: string;
  displayImageUrl: string | null;
  quoteAsset: string;
  quoteSymbol: string;
  quoteImageUrl: string | null;
  launchedAt: number;
  ageSeconds: number;
  fdvUsdX18: string | null;
  fdvUsdDisplay: string | null;
  /** Lifetime trades — token_market_state.trade_count_all_time */
  tradeCountAllTime: number | null;
  /** Preserved 24h window; not shown on the Phase-1 board. */
  tradeCount24h: number | null;
  holderCountAll: number | null;
  holderCountRetail: number | null;
};

export type MarketsLiveHealth = 'live' | 'stale';

export type MarketsBoardSnapshot = {
  status: 'ok' | 'empty' | 'error';
  items: MarketsBoardItem[];
  /** Epoch ms of last successful snapshot (SSR or live). */
  updatedAt: number | null;
  /** Poll health for the LIVE indicator (client-managed after mount). */
  liveHealth?: MarketsLiveHealth;
  message?: string;
};

export function toMarketsBoardItem(
  token: TokenDiscoveryItem,
  catalogue: readonly PublicQuoteCatalogueItem[],
): MarketsBoardItem {
  return {
    tokenAddress: token.tokenAddress,
    name: token.name,
    symbol: token.symbol,
    imageUri: token.imageUri,
    displayImageUrl: token.displayImageUrl,
    quoteAsset: token.quoteAsset,
    quoteSymbol: quoteDisplaySymbol(token.quoteAsset, catalogue),
    quoteImageUrl: quoteCatalogueImageUrl(token.quoteAsset, catalogue),
    launchedAt: token.launchedAt,
    ageSeconds: token.ageSeconds,
    fdvUsdX18: token.fdvUsdX18,
    fdvUsdDisplay: token.fdvUsdDisplay,
    tradeCountAllTime: token.tradeCountAllTime,
    tradeCount24h: token.tradeCount24h,
    holderCountAll: token.holderCountAll,
    holderCountRetail: token.holderCountRetail,
  };
}

export function buildMarketsBoardItems(
  tokens: readonly TokenDiscoveryItem[],
  catalogue: readonly PublicQuoteCatalogueItem[],
): MarketsBoardItem[] {
  return rankMarketsByFdv(tokens.map((t) => toMarketsBoardItem(t, catalogue)));
}
