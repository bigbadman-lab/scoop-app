import type { TokenDiscoveryItem } from '../dto.js';
import { formatRawAmount, formatX18 } from '../decimal.js';

/**
 * Launched markets remain NEW for 7 days (discovery label).
 * Keep in sync with @scoop/shared NEW_MARKET_WINDOW_SECONDS.
 */
export const NEW_MARKET_WINDOW_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_NEW_WINDOW_SECONDS = NEW_MARKET_WINDOW_SECONDS;
export const DEFAULT_SOON_THRESHOLD_BPS = 8000;
export const DEFAULT_QUOTE_DECIMALS = 18;

export interface DiscoverySqlRow {
  chain_id: string | number;
  token_address: string;
  name: string;
  symbol: string;
  decimals: number;
  image_uri: string;
  display_image_url: string | null;
  pool_id: string;
  creator_id: string;
  quote_asset: string;
  launched_at: string | number;
  age_seconds: string | number;
  launch_progress_bps: number | null;
  launch_complete: boolean | null;
  is_new: boolean;
  is_soon: boolean;
  is_bonded: boolean;
  price_quote_x18: string | null;
  price_usd_x18: string | null;
  fdv_usd_x18: string | null;
  volume_24h_quote_raw: string | null;
  volume_24h_usd_x18: string | null;
  trade_count_24h: number | null;
  trade_count_all_time: number | null;
  buy_count_24h: number | null;
  sell_count_24h: number | null;
  holder_count_all: number | null;
  holder_count_retail: number | null;
  last_trade_at: string | number | null;
  price_change_24h_bps: number | null;
  quote_decimals: number | null;
}

export function mapDiscoveryItem(
  row: DiscoverySqlRow,
  quoteDecimals = DEFAULT_QUOTE_DECIMALS,
): TokenDiscoveryItem {
  const priceQuoteX18 = row.price_quote_x18 == null ? null : String(row.price_quote_x18);
  const priceUsdX18 = row.price_usd_x18 == null ? null : String(row.price_usd_x18);
  const fdvUsdX18 = row.fdv_usd_x18 == null ? null : String(row.fdv_usd_x18);
  const volume24h = row.volume_24h_quote_raw == null ? null : String(row.volume_24h_quote_raw);
  const volume24hUsd =
    row.volume_24h_usd_x18 == null ? null : String(row.volume_24h_usd_x18);
  const resolvedQuoteDecimals =
    row.quote_decimals == null ? quoteDecimals : Number(row.quote_decimals);

  return {
    chainId: Number(row.chain_id),
    tokenAddress: String(row.token_address),
    name: String(row.name),
    symbol: String(row.symbol),
    decimals: Number(row.decimals),
    imageUri: String(row.image_uri ?? ''),
    displayImageUrl:
      row.display_image_url == null || String(row.display_image_url).trim() === ''
        ? null
        : String(row.display_image_url),
    poolId: String(row.pool_id),
    creatorId: String(row.creator_id),
    quoteAsset: String(row.quote_asset),
    launchedAt: Number(row.launched_at),
    ageSeconds: Number(row.age_seconds ?? 0),
    launchProgressBps: Number(row.launch_progress_bps ?? 0),
    launchComplete: Boolean(row.launch_complete),
    isNew: Boolean(row.is_new),
    isSoon: Boolean(row.is_soon),
    isBonded: Boolean(row.is_bonded),
    priceQuoteX18,
    priceQuoteDisplay: formatX18(priceQuoteX18),
    priceUsdX18,
    priceUsdDisplay: formatX18(priceUsdX18),
    fdvUsdX18,
    fdvUsdDisplay: formatX18(fdvUsdX18),
    volume24hQuoteRaw: volume24h,
    volume24hQuoteDisplay:
      volume24h == null ? null : formatRawAmount(volume24h, resolvedQuoteDecimals),
    volume24hUsdX18: volume24hUsd,
    volume24hUsdDisplay: formatX18(volume24hUsd),
    tradeCount24h: row.trade_count_24h == null ? null : Number(row.trade_count_24h),
    tradeCountAllTime:
      row.trade_count_all_time == null ? null : Number(row.trade_count_all_time),
    buyCount24h: row.buy_count_24h == null ? null : Number(row.buy_count_24h),
    sellCount24h: row.sell_count_24h == null ? null : Number(row.sell_count_24h),
    holderCountAll: row.holder_count_all == null ? null : Number(row.holder_count_all),
    holderCountRetail: row.holder_count_retail == null ? null : Number(row.holder_count_retail),
    lastTradeAt: row.last_trade_at == null ? null : Number(row.last_trade_at),
    priceChange24hBps: row.price_change_24h_bps == null ? null : Number(row.price_change_24h_bps),
  };
}

/** Shared SELECT for discovery/detail product rows. Params: $1 chainId, $2 newWindow, $3 soonBps */
export const DISCOVERY_SELECT = `
  SELECT
    l.chain_id,
    l.token_address,
    t.name,
    t.symbol,
    t.decimals,
    t.image_uri,
    t.display_image_url,
    l.pool_id,
    l.creator_id,
    l.quote_asset,
    l.launched_at,
    (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
    COALESCE(m.launch_progress_bps, 0) AS launch_progress_bps,
    COALESCE(m.launch_complete, FALSE) AS launch_complete,
    (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)) AS is_new,
    (
      COALESCE(m.launch_progress_bps, 0) >= $3::INT
      AND COALESCE(m.launch_complete, FALSE) = FALSE
    ) AS is_soon,
    (COALESCE(m.launch_complete, FALSE) = TRUE) AS is_bonded,
    m.price_quote_x18::text AS price_quote_x18,
    m.price_usd_x18::text AS price_usd_x18,
    m.fdv_usd_x18::text AS fdv_usd_x18,
    m.volume_24h_quote_raw::text AS volume_24h_quote_raw,
    m.volume_24h_usd_x18::text AS volume_24h_usd_x18,
    m.trade_count_24h,
    m.trade_count_all_time,
    m.buy_count_24h,
    m.sell_count_24h,
    m.holder_count_all,
    m.holder_count_retail,
    m.last_trade_at,
    m.price_change_24h_bps,
    q.decimals AS quote_decimals
  FROM launches l
  INNER JOIN tokens t
    ON t.chain_id = l.chain_id AND t.token_address = l.token_address
  LEFT JOIN token_market_state m
    ON m.chain_id = l.chain_id AND m.token_address = l.token_address
  LEFT JOIN quote_assets q
    ON q.chain_id = l.chain_id AND q.quote_asset = l.quote_asset
`;
