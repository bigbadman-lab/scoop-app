import type { Queryable } from '../types.js';
import {
  DEFAULT_SOON_THRESHOLD_BPS,
  NEW_MARKET_WINDOW_SECONDS,
} from '../queries/_discoverySql.js';

export interface DiscoveryLaunchRow {
  chainId: number;
  tokenAddress: string;
  poolId: string;
  launchedAt: bigint;
  creatorId: string;
  quoteAsset: string;
  launchProgressBps: number;
  launchComplete: boolean;
  priceQuoteX18: string | null;
  volume24hQuoteRaw: string | null;
  tradeCount24h: number | null;
  holderCountAll: number | null;
  holderCountRetail: number | null;
  lastTradeAt: bigint | null;
  ageSeconds: number;
  isNew: boolean;
  isSoon: boolean;
  isBonded: boolean;
}

function mapRow(row: Record<string, unknown>): DiscoveryLaunchRow {
  return {
    chainId: Number(row.chain_id),
    tokenAddress: String(row.token_address),
    poolId: String(row.pool_id),
    launchedAt: BigInt(String(row.launched_at)),
    creatorId: String(row.creator_id),
    quoteAsset: String(row.quote_asset),
    launchProgressBps: Number(row.launch_progress_bps ?? 0),
    launchComplete: Boolean(row.launch_complete),
    priceQuoteX18: row.price_quote_x18 == null ? null : String(row.price_quote_x18),
    volume24hQuoteRaw:
      row.volume_24h_quote_raw == null ? null : String(row.volume_24h_quote_raw),
    tradeCount24h: row.trade_count_24h == null ? null : Number(row.trade_count_24h),
    holderCountAll: row.holder_count_all == null ? null : Number(row.holder_count_all),
    holderCountRetail:
      row.holder_count_retail == null ? null : Number(row.holder_count_retail),
    lastTradeAt: row.last_trade_at == null ? null : BigInt(String(row.last_trade_at)),
    ageSeconds: Number(row.age_seconds ?? 0),
    isNew: Boolean(row.is_new),
    isSoon: Boolean(row.is_soon),
    isBonded: Boolean(row.is_bonded),
  };
}

const BASE_SELECT = `
  SELECT
    l.chain_id,
    l.token_address,
    l.pool_id,
    l.launched_at,
    l.creator_id,
    l.quote_asset,
    COALESCE(m.launch_progress_bps, 0) AS launch_progress_bps,
    COALESCE(m.launch_complete, FALSE) AS launch_complete,
    m.price_quote_x18,
    m.volume_24h_quote_raw,
    m.trade_count_24h,
    m.holder_count_all,
    m.holder_count_retail,
    m.last_trade_at,
    (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
    (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)) AS is_new,
    (
      COALESCE(m.launch_progress_bps, 0) >= $3::INT
      AND COALESCE(m.launch_complete, FALSE) = FALSE
    ) AS is_soon,
    (COALESCE(m.launch_complete, FALSE) = TRUE) AS is_bonded
  FROM launches l
  LEFT JOIN token_market_state m
    ON m.chain_id = l.chain_id AND m.token_address = l.token_address
  WHERE l.chain_id = $1
`;

export async function queryDiscoveryAll(
  db: Queryable,
  chainId: number,
  windowSec = NEW_MARKET_WINDOW_SECONDS,
  soonThresholdBps = DEFAULT_SOON_THRESHOLD_BPS,
): Promise<DiscoveryLaunchRow[]> {
  const result = await db.query(`${BASE_SELECT} ORDER BY l.launched_at DESC`, [
    chainId,
    windowSec,
    soonThresholdBps,
  ]);
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function queryDiscoveryNew(
  db: Queryable,
  chainId: number,
  windowSec = NEW_MARKET_WINDOW_SECONDS,
  soonThresholdBps = DEFAULT_SOON_THRESHOLD_BPS,
): Promise<DiscoveryLaunchRow[]> {
  const result = await db.query(
    `${BASE_SELECT}
     AND l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)
     ORDER BY l.launched_at DESC`,
    [chainId, windowSec, soonThresholdBps],
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function queryDiscoverySoon(
  db: Queryable,
  chainId: number,
  windowSec = NEW_MARKET_WINDOW_SECONDS,
  soonThresholdBps = DEFAULT_SOON_THRESHOLD_BPS,
): Promise<DiscoveryLaunchRow[]> {
  const result = await db.query(
    `${BASE_SELECT}
     AND COALESCE(m.launch_progress_bps, 0) >= $3::INT
     AND COALESCE(m.launch_complete, FALSE) = FALSE
     ORDER BY m.launch_progress_bps DESC, l.launched_at DESC`,
    [chainId, windowSec, soonThresholdBps],
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function queryDiscoveryBonded(
  db: Queryable,
  chainId: number,
  windowSec = NEW_MARKET_WINDOW_SECONDS,
  soonThresholdBps = DEFAULT_SOON_THRESHOLD_BPS,
): Promise<DiscoveryLaunchRow[]> {
  const result = await db.query(
    `${BASE_SELECT}
     AND COALESCE(m.launch_complete, FALSE) = TRUE
     ORDER BY l.launched_at DESC`,
    [chainId, windowSec, soonThresholdBps],
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}
