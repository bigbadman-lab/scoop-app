/**
 * Server-only query wrappers. Re-exports @scoop/db product queries
 * bound to the server pool — never expose DATABASE_URL to the browser.
 */

export {
  getTokens,
  getToken,
  getActiveMarkets,
  getDiscoverBoard,
  getDiscoverTrending,
  getDiscoverBonding,
  DISCOVER_TAB_LIMIT,
  DISCOVER_TRENDING_MIN_TRADES_24H,
  getTrades,
  getHolders,
  getCandles,
  getCreatorEarnings,
  getRankings,
  getIndexerStatus,
  assertCandleInterval,
  assertRankingType,
  clampLimit,
  clampOffset,
  normalizeAddress,
  normalizeBytes32,
  type TokenDiscoveryItem,
  type TokenDetail,
  type TradeItem,
  type HolderItem,
  type CandleItem,
  type CreatorEarningsSummary,
  type DiscoveryRankingItem,
  type IndexerStatus,
  type DiscoveryFilter,
  type DiscoverySort,
  type RankingType,
  type TradeSide,
  type GetTokensOptions,
  type GetActiveMarketsOptions,
  type GetDiscoverBoardOptions,
  type DiscoverBoardRows,
  type GetTradesOptions,
  type GetHoldersOptions,
  type GetCandlesOptions,
  type GetRankingsOptions,
  type Queryable,
} from '@scoop/db';

import type { Queryable } from '@scoop/db';
import { getServerPool } from './db';

export function serverDb(): Queryable {
  return getServerPool();
}
