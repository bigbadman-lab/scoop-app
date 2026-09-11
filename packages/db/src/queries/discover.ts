import type { Queryable } from '../types.js';
import { clampLimit } from '../decimal.js';
import type { TokenDiscoveryItem } from '../dto.js';
import {
  DEFAULT_NEW_WINDOW_SECONDS,
  DEFAULT_SOON_THRESHOLD_BPS,
  DISCOVERY_SELECT,
  mapDiscoveryItem,
  type DiscoverySqlRow,
} from './_discoverySql.js';
import { getTokens } from './tokens.js';

/** Homepage Discover board page size. */
export const DISCOVER_TAB_LIMIT = 24;

/** TRENDING MVP: minimum projected 24h trades. */
export const DISCOVER_TRENDING_MIN_TRADES_24H = 3;

export interface GetDiscoverBoardOptions {
  chainId: number;
  limit?: number;
  newWindowSeconds?: number;
  soonThresholdBps?: number;
  trendingMinTrades24h?: number;
}

export type DiscoverBoardRows = {
  new: TokenDiscoveryItem[];
  bonding: TokenDiscoveryItem[];
  trending: TokenDiscoveryItem[];
};

/**
 * TRENDING MVP — projected 24h activity only (no raw trade aggregation).
 *
 * Eligibility: trade_count_24h >= min AND volume_24h_usd_x18 > 0
 * Rank: volume USD DESC, trade count DESC, buy count DESC, token_address ASC
 */
export async function getDiscoverTrending(
  db: Queryable,
  options: {
    chainId: number;
    limit?: number;
    newWindowSeconds?: number;
    soonThresholdBps?: number;
    minTrades24h?: number;
  },
): Promise<TokenDiscoveryItem[]> {
  const limit = clampLimit(options.limit ?? DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT);
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;
  const minTrades = options.minTrades24h ?? DISCOVER_TRENDING_MIN_TRADES_24H;

  const sql = `
    ${DISCOVERY_SELECT}
    WHERE l.chain_id = $1
      AND COALESCE(m.trade_count_24h, 0) >= $4::INT
      AND m.volume_24h_usd_x18 IS NOT NULL
      AND m.volume_24h_usd_x18 > 0
    ORDER BY
      m.volume_24h_usd_x18 DESC,
      COALESCE(m.trade_count_24h, 0) DESC,
      COALESCE(m.buy_count_24h, 0) DESC,
      l.token_address ASC
    LIMIT $5
  `;

  const result = await db.query(sql, [
    options.chainId,
    newWindow,
    soonBps,
    minTrades,
    limit,
  ]);
  return result.rows.map((r) => mapDiscoveryItem(r as DiscoverySqlRow));
}

/**
 * Discover BONDING — all incomplete launch-inventory markets (public tab).
 *
 * Predicate: launch_complete = false (no 80% / soon threshold).
 * Internal discovery filter `soon` (>= 8000 bps) is intentionally separate.
 *
 * Rank: progress DESC, launched_at DESC, token_address ASC
 */
export async function getDiscoverBonding(
  db: Queryable,
  options: {
    chainId: number;
    limit?: number;
    newWindowSeconds?: number;
    soonThresholdBps?: number;
  },
): Promise<TokenDiscoveryItem[]> {
  const limit = clampLimit(options.limit ?? DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT);
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;

  const sql = `
    ${DISCOVERY_SELECT}
    WHERE l.chain_id = $1
      AND COALESCE(m.launch_complete, FALSE) = FALSE
    ORDER BY
      COALESCE(m.launch_progress_bps, 0) DESC,
      l.launched_at DESC,
      l.token_address ASC
    LIMIT $4
  `;

  const result = await db.query(sql, [options.chainId, newWindow, soonBps, limit]);
  return result.rows.map((r) => mapDiscoveryItem(r as DiscoverySqlRow));
}

/**
 * Homepage Discover snapshot — three bounded parallel queries on projected state.
 */
export async function getDiscoverBoard(
  db: Queryable,
  options: GetDiscoverBoardOptions,
): Promise<DiscoverBoardRows> {
  const limit = clampLimit(options.limit ?? DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT, DISCOVER_TAB_LIMIT);
  const newWindow = options.newWindowSeconds;
  const soonBps = options.soonThresholdBps;
  const minTrades = options.trendingMinTrades24h;

  const [newItems, bondingItems, trendingItems] = await Promise.all([
    getTokens(db, {
      chainId: options.chainId,
      filter: 'new',
      sort: 'newest',
      limit,
      newWindowSeconds: newWindow,
      soonThresholdBps: soonBps,
    }),
    getDiscoverBonding(db, {
      chainId: options.chainId,
      limit,
      newWindowSeconds: newWindow,
      soonThresholdBps: soonBps,
    }),
    getDiscoverTrending(db, {
      chainId: options.chainId,
      limit,
      newWindowSeconds: newWindow,
      soonThresholdBps: soonBps,
      minTrades24h: minTrades,
    }),
  ]);

  return {
    new: newItems,
    bonding: bondingItems,
    trending: trendingItems,
  };
}
