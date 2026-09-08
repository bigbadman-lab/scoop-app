import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { clampLimit, clampOffset, formatRawAmount } from '../decimal.js';
import type { DiscoveryFilter, DiscoverySort, TokenDetail, TokenDiscoveryItem } from '../dto.js';
import {
  DEFAULT_NEW_WINDOW_SECONDS,
  DEFAULT_SOON_THRESHOLD_BPS,
  DISCOVERY_SELECT,
  mapDiscoveryItem,
  type DiscoverySqlRow,
} from './_discoverySql.js';

export interface GetTokensOptions {
  chainId: number;
  filter?: DiscoveryFilter;
  sort?: DiscoverySort;
  limit?: number;
  offset?: number;
  newWindowSeconds?: number;
  soonThresholdBps?: number;
}

function filterClause(filter: DiscoveryFilter): string {
  switch (filter) {
    case 'new':
      return `AND l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)`;
    case 'soon':
      return `AND COALESCE(m.launch_progress_bps, 0) >= $3::INT
              AND COALESCE(m.launch_complete, FALSE) = FALSE`;
    case 'bonded':
      return `AND COALESCE(m.launch_complete, FALSE) = TRUE`;
    case 'all':
    default:
      return '';
  }
}

function orderClause(sort: DiscoverySort): string {
  switch (sort) {
    case 'oldest':
      return 'ORDER BY l.launched_at ASC';
    case 'volume24h':
      return 'ORDER BY COALESCE(m.volume_24h_quote_raw, 0) DESC, l.launched_at DESC';
    case 'fdv':
      return 'ORDER BY COALESCE(m.fdv_usd_x18, 0) DESC NULLS LAST, l.launched_at DESC';
    case 'progress':
      return 'ORDER BY COALESCE(m.launch_progress_bps, 0) DESC, l.launched_at DESC';
    case 'holders':
      return 'ORDER BY COALESCE(m.holder_count_retail, 0) DESC, l.launched_at DESC';
    case 'trades24h':
      return 'ORDER BY COALESCE(m.trade_count_24h, 0) DESC, l.launched_at DESC';
    case 'newest':
    default:
      return 'ORDER BY l.launched_at DESC';
  }
}

export async function getTokens(
  db: Queryable,
  options: GetTokensOptions,
): Promise<TokenDiscoveryItem[]> {
  const filter = options.filter ?? 'all';
  const sort = options.sort ?? 'newest';
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;

  const sql = `
    ${DISCOVERY_SELECT}
    WHERE l.chain_id = $1
    ${filterClause(filter)}
    ${orderClause(sort)}
    LIMIT $4 OFFSET $5
  `;

  const result = await db.query(sql, [options.chainId, newWindow, soonBps, limit, offset]);
  return result.rows.map((r) => mapDiscoveryItem(r as DiscoverySqlRow));
}

export async function getToken(
  db: Queryable,
  chainId: number,
  address: string,
  options?: { newWindowSeconds?: number; soonThresholdBps?: number },
): Promise<TokenDetail | null> {
  const tokenAddress = normalizeAddress(address);
  const newWindow = options?.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options?.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;

  const result = await db.query(
    `
    SELECT
      l.chain_id,
      l.token_address,
      t.name,
      t.symbol,
      t.decimals,
      t.image_uri,
      t.display_image_url,
      t.description,
      t.twitter,
      t.telegram,
      t.discord,
      t.website,
      t.farcaster,
      t.total_supply_raw::text AS total_supply_raw,
      t.deployer_address,
      l.factory_address,
      l.fee_distributor_address,
      l.liquidity_locker_address,
      l.pool_id,
      l.creator_id,
      l.quote_asset,
      l.launched_at,
      (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
      COALESCE(m.launch_progress_bps, 0) AS launch_progress_bps,
      COALESCE(m.launch_complete, FALSE) AS launch_complete,
      (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $3::INT)) AS is_new,
      (
        COALESCE(m.launch_progress_bps, 0) >= $4::INT
        AND COALESCE(m.launch_complete, FALSE) = FALSE
      ) AS is_soon,
      (COALESCE(m.launch_complete, FALSE) = TRUE) AS is_bonded,
      m.price_quote_x18::text AS price_quote_x18,
      m.fdv_usd_x18::text AS fdv_usd_x18,
      m.volume_24h_quote_raw::text AS volume_24h_quote_raw,
      m.volume_24h_usd_x18::text AS volume_24h_usd_x18,
      m.trade_count_24h,
      m.holder_count_all,
      m.holder_count_retail,
      m.last_trade_at,
      m.price_change_24h_bps,
      m.sqrt_price_x96::text AS sqrt_price_x96,
      m.tick,
      m.liquidity_raw::text AS liquidity_raw,
      m.price_usd_x18::text AS price_usd_x18,
      m.quote_usd_x18::text AS quote_usd_x18,
      m.quote_volume_all_time_raw::text AS quote_volume_all_time_raw,
      m.token_volume_all_time_raw::text AS token_volume_all_time_raw,
      m.trade_count_all_time,
      m.buy_count_all_time,
      m.sell_count_all_time,
      m.initial_token_inventory_raw::text AS initial_token_inventory_raw,
      m.current_token_inventory_raw::text AS current_token_inventory_raw,
      m.source_block
    FROM launches l
    INNER JOIN tokens t
      ON t.chain_id = l.chain_id AND t.token_address = l.token_address
    LEFT JOIN token_market_state m
      ON m.chain_id = l.chain_id AND m.token_address = l.token_address
    WHERE l.chain_id = $1 AND l.token_address = $2
    LIMIT 1
    `,
    [chainId, tokenAddress, newWindow, soonBps],
  );

  const row = result.rows[0] as
    | (DiscoverySqlRow & {
        description: string;
        twitter: string;
        telegram: string;
        discord: string;
        website: string;
        farcaster: string;
        total_supply_raw: string;
        deployer_address: string;
        factory_address: string;
        fee_distributor_address: string;
        liquidity_locker_address: string;
        sqrt_price_x96: string | null;
        tick: number | null;
        liquidity_raw: string | null;
        price_usd_x18: string | null;
        quote_usd_x18: string | null;
        quote_volume_all_time_raw: string | null;
        token_volume_all_time_raw: string | null;
        trade_count_all_time: number | null;
        buy_count_all_time: number | null;
        sell_count_all_time: number | null;
        initial_token_inventory_raw: string | null;
        current_token_inventory_raw: string | null;
        source_block: string | number | null;
      })
    | undefined;

  if (!row) return null;

  const base = mapDiscoveryItem(row);
  const totalSupplyRaw = String(row.total_supply_raw);

  return {
    ...base,
    description: String(row.description ?? ''),
    twitter: String(row.twitter ?? ''),
    telegram: String(row.telegram ?? ''),
    discord: String(row.discord ?? ''),
    website: String(row.website ?? ''),
    farcaster: String(row.farcaster ?? ''),
    totalSupplyRaw,
    totalSupplyDisplay: formatRawAmount(totalSupplyRaw, base.decimals),
    deployerAddress: String(row.deployer_address),
    factoryAddress: String(row.factory_address),
    feeDistributorAddress: String(row.fee_distributor_address),
    liquidityLockerAddress: String(row.liquidity_locker_address),
    sqrtPriceX96: row.sqrt_price_x96 == null ? null : String(row.sqrt_price_x96),
    tick: row.tick == null ? null : Number(row.tick),
    liquidityRaw: row.liquidity_raw == null ? null : String(row.liquidity_raw),
    quoteUsdX18: row.quote_usd_x18 == null ? null : String(row.quote_usd_x18),
    quoteVolumeAllTimeRaw:
      row.quote_volume_all_time_raw == null ? null : String(row.quote_volume_all_time_raw),
    tokenVolumeAllTimeRaw:
      row.token_volume_all_time_raw == null ? null : String(row.token_volume_all_time_raw),
    tradeCountAllTime: row.trade_count_all_time == null ? null : Number(row.trade_count_all_time),
    buyCountAllTime: row.buy_count_all_time == null ? null : Number(row.buy_count_all_time),
    sellCountAllTime: row.sell_count_all_time == null ? null : Number(row.sell_count_all_time),
    initialTokenInventoryRaw:
      row.initial_token_inventory_raw == null ? null : String(row.initial_token_inventory_raw),
    currentTokenInventoryRaw:
      row.current_token_inventory_raw == null ? null : String(row.current_token_inventory_raw),
    sourceBlock: row.source_block == null ? null : Number(row.source_block),
  };
}
