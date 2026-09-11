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
  fdvUsdX18: string | null;
  fdvUsdDisplay: string | null;
};

export type MarketsBoardSnapshot = {
  status: 'ok' | 'empty' | 'error';
  items: MarketsBoardItem[];
  /** Epoch ms of last successful snapshot (SSR or live). */
  updatedAt: number | null;
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
    fdvUsdX18: token.fdvUsdX18,
    fdvUsdDisplay: token.fdvUsdDisplay,
  };
}

export function buildMarketsBoardItems(
  tokens: readonly TokenDiscoveryItem[],
  catalogue: readonly PublicQuoteCatalogueItem[],
): MarketsBoardItem[] {
  return rankMarketsByFdv(tokens.map((t) => toMarketsBoardItem(t, catalogue)));
}
