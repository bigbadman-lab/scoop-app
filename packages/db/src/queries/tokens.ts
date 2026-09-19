import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { clampLimit, clampOffset, formatRawAmount } from '../decimal.js';
import type {
  DiscoveryFilter,
  DiscoverySort,
  TokenDetail,
  TokenDiscoveryItem,
  TokenFeeAssetDistribution,
} from '../dto.js';
import {
  DEFAULT_NEW_WINDOW_SECONDS,
  DEFAULT_QUOTE_DECIMALS,
  DEFAULT_SOON_THRESHOLD_BPS,
  DISCOVERY_SELECT,
  mapDiscoveryItem,
  type DiscoverySqlRow,
} from './_discoverySql.js';
import { HIDDEN_PRODUCTION_CANARY_SQL } from './hidden-production-canaries.js';

const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface GetTokensOptions {
  chainId: number;
  filter?: DiscoveryFilter;
  sort?: DiscoverySort;
  limit?: number;
  /**
   * Upper bound for `limit` (default 100).
   * Markets board uses a higher cap so one request can return the full active set.
   */
  maxLimit?: number;
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

function truncatedAssetSymbol(address: string): string {
  const a = normalizeAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function isNativeEth(assetKind: string, assetAddress: string): boolean {
  return assetKind === 'eth' || assetAddress === NATIVE_ETH_ADDRESS;
}

function feeAssetRank(
  asset: TokenFeeAssetDistribution,
  quoteAsset: string,
  launchToken: string,
): number {
  if (isNativeEth(asset.assetKind, asset.assetAddress)) return 0;
  if (asset.assetAddress === quoteAsset) return 1;
  if (asset.assetAddress === launchToken) return 2;
  return 3;
}

/** Deterministic MARKET ordering: ETH → quote → launch token → other. */
export function orderTokenFeeDistributions(
  assets: TokenFeeAssetDistribution[],
  quoteAsset: string,
  launchToken: string,
): TokenFeeAssetDistribution[] {
  const quote = normalizeAddress(quoteAsset);
  const token = normalizeAddress(launchToken);
  return [...assets].sort((a, b) => {
    const ra = feeAssetRank(a, quote, token);
    const rb = feeAssetRank(b, quote, token);
    if (ra !== rb) return ra - rb;
    return a.assetAddress.localeCompare(b.assetAddress);
  });
}

type FeeAssetAggRow = {
  asset_kind: string;
  asset_address: string;
  creator_raw: string;
  buyback_raw: string;
  symbol: string | null;
  decimals: number | string | null;
};

function buildFeeDistributionEntry(
  row: FeeAssetAggRow,
  amountRaw: string,
): TokenFeeAssetDistribution {
  const assetAddress = normalizeAddress(row.asset_address);
  const assetKind: 'eth' | 'token' = isNativeEth(row.asset_kind, assetAddress)
    ? 'eth'
    : 'token';
  const decimalsRaw =
    row.decimals == null || row.decimals === ''
      ? null
      : Number(row.decimals);
  const decimals =
    assetKind === 'eth'
      ? 18
      : decimalsRaw != null && Number.isFinite(decimalsRaw) && decimalsRaw >= 0
        ? decimalsRaw
        : DEFAULT_QUOTE_DECIMALS;
  const symbol =
    assetKind === 'eth'
      ? 'ETH'
      : (row.symbol ?? '').trim() || truncatedAssetSymbol(assetAddress);
  return {
    assetAddress,
    assetKind,
    symbol,
    decimals,
    amountRaw,
    amountDisplay: formatRawAmount(amountRaw, decimals),
  };
}

function mapFeeDistributionArrays(
  rows: FeeAssetAggRow[],
  quoteAsset: string,
  launchToken: string,
): {
  creatorFeeDistributions: TokenFeeAssetDistribution[];
  buybackFeeDistributions: TokenFeeAssetDistribution[];
} {
  const creators: TokenFeeAssetDistribution[] = [];
  const buybacks: TokenFeeAssetDistribution[] = [];
  for (const row of rows) {
    const creatorRaw = String(row.creator_raw ?? '0');
    const buybackRaw = String(row.buyback_raw ?? '0');
    if (BigInt(creatorRaw) > 0n) {
      creators.push(buildFeeDistributionEntry(row, creatorRaw));
    }
    if (BigInt(buybackRaw) > 0n) {
      buybacks.push(buildFeeDistributionEntry(row, buybackRaw));
    }
  }
  return {
    creatorFeeDistributions: orderTokenFeeDistributions(
      creators,
      quoteAsset,
      launchToken,
    ),
    buybackFeeDistributions: orderTokenFeeDistributions(
      buybacks,
      quoteAsset,
      launchToken,
    ),
  };
}

function ethLegFromDistributions(
  distributions: TokenFeeAssetDistribution[],
): { raw: string; display: string } | null {
  const eth = distributions.find(
    (d) => d.assetKind === 'eth' || d.assetAddress === NATIVE_ETH_ADDRESS,
  );
  if (!eth) return null;
  return { raw: eth.amountRaw, display: eth.amountDisplay };
}


function orderClause(sort: DiscoverySort): string {
  switch (sort) {
    case 'oldest':
      return 'ORDER BY l.launched_at ASC, l.token_address ASC';
    case 'volume24h':
      return 'ORDER BY COALESCE(m.volume_24h_quote_raw, 0) DESC, l.launched_at DESC, l.token_address ASC';
    case 'fdv':
      return 'ORDER BY COALESCE(m.fdv_usd_x18, 0) DESC NULLS LAST, l.launched_at DESC, l.token_address ASC';
    case 'progress':
      return 'ORDER BY COALESCE(m.launch_progress_bps, 0) DESC, l.launched_at DESC, l.token_address ASC';
    case 'holders':
      return 'ORDER BY COALESCE(m.holder_count_retail, 0) DESC, l.launched_at DESC, l.token_address ASC';
    case 'trades24h':
      return 'ORDER BY COALESCE(m.trade_count_24h, 0) DESC, l.launched_at DESC, l.token_address ASC';
    case 'newest':
    default:
      return 'ORDER BY l.launched_at DESC, l.token_address ASC';
  }
}

export async function getTokens(
  db: Queryable,
  options: GetTokensOptions,
): Promise<TokenDiscoveryItem[]> {
  const filter = options.filter ?? 'all';
  const sort = options.sort ?? 'newest';
  const limit = clampLimit(options.limit, options.maxLimit ?? 100);
  const offset = clampOffset(options.offset);
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;

  const sql = `
    ${DISCOVERY_SELECT}
    WHERE l.chain_id = $1
    ${HIDDEN_PRODUCTION_CANARY_SQL}
    ${filterClause(filter)}
    ${orderClause(sort)}
    LIMIT $4 OFFSET $5
  `;

  const result = await db.query(sql, [options.chainId, newWindow, soonBps, limit, offset]);
  return result.rows.map((r) => mapDiscoveryItem(r as DiscoverySqlRow));
}

export interface GetActiveMarketsOptions {
  chainId: number;
  newWindowSeconds?: number;
  soonThresholdBps?: number;
}

/**
 * Complete active market set for `/markets` (all indexed launches on the chain).
 * No product-level LIMIT/OFFSET — naturally bounded by indexed launch rows.
 * Callers apply canonical FDV ranking in application code.
 */
export async function getActiveMarkets(
  db: Queryable,
  options: GetActiveMarketsOptions,
): Promise<TokenDiscoveryItem[]> {
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;

  const sql = `
    ${DISCOVERY_SELECT}
    WHERE l.chain_id = $1
    ${HIDDEN_PRODUCTION_CANARY_SQL}
  `;

  const result = await db.query(sql, [options.chainId, newWindow, soonBps]);
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
      COALESCE(l.market_source, 'scoop') AS market_source,
      l.graduation_status,
      l.curve_address,
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
      m.buy_count_24h,
      m.sell_count_24h,
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
      m.source_block,
      p.fee AS pool_fee,
      p.currency0,
      p.currency1,
      p.tick_spacing,
      p.hooks
    FROM launches l
    INNER JOIN tokens t
      ON t.chain_id = l.chain_id AND t.token_address = l.token_address
    LEFT JOIN token_market_state m
      ON m.chain_id = l.chain_id AND m.token_address = l.token_address
    LEFT JOIN pools p
      ON p.chain_id = l.chain_id AND p.pool_id = l.pool_id
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
        pool_fee: number | string | null;
        currency0: string | null;
        currency1: string | null;
        tick_spacing: number | string | null;
        hooks: string | null;
      })
    | undefined;

  if (!row) return null;

  const feeResult = await db.query(
    `
    SELECT
      g.asset_kind,
      g.asset_address,
      g.creator_raw,
      g.buyback_raw,
      CASE
        WHEN g.asset_kind = 'eth'
          OR g.asset_address = '${NATIVE_ETH_ADDRESS}'
        THEN 'ETH'
        ELSE COALESCE(
          NULLIF(qa.display_symbol, ''),
          NULLIF(qa.symbol, ''),
          NULLIF(tok.symbol, '')
        )
      END AS symbol,
      CASE
        WHEN g.asset_kind = 'eth'
          OR g.asset_address = '${NATIVE_ETH_ADDRESS}'
        THEN 18
        ELSE COALESCE(qa.decimals, tok.decimals)
      END AS decimals
    FROM (
      SELECT
        asset_kind,
        asset_address,
        SUM(creator_raw)::text AS creator_raw,
        SUM(buyback_raw)::text AS buyback_raw
      FROM fee_distributions
      WHERE chain_id = $1 AND scooptoken_address = $2
      GROUP BY asset_kind, asset_address
    ) g
    LEFT JOIN quote_assets qa
      ON qa.chain_id = $1 AND qa.quote_asset = g.asset_address
    LEFT JOIN tokens tok
      ON tok.chain_id = $1 AND tok.token_address = g.asset_address
    `,
    [chainId, tokenAddress],
  );

  const base = mapDiscoveryItem(row);
  const { creatorFeeDistributions, buybackFeeDistributions } =
    mapFeeDistributionArrays(
      feeResult.rows as FeeAssetAggRow[],
      base.quoteAsset,
      tokenAddress,
    );
  const creatorEth = ethLegFromDistributions(creatorFeeDistributions);
  const buybackEth = ethLegFromDistributions(buybackFeeDistributions);
  const totalSupplyRaw = String(row.total_supply_raw);
  const poolFee =
    row.pool_fee == null || row.pool_fee === ''
      ? null
      : Number(row.pool_fee);
  const tickSpacing =
    row.tick_spacing == null || row.tick_spacing === ''
      ? null
      : Number(row.tick_spacing);

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
    feeDistributorAddress:
      row.fee_distributor_address == null || row.fee_distributor_address === ''
        ? null
        : String(row.fee_distributor_address),
    liquidityLockerAddress:
      row.liquidity_locker_address == null || row.liquidity_locker_address === ''
        ? null
        : String(row.liquidity_locker_address),
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
    poolFee: poolFee != null && Number.isFinite(poolFee) ? poolFee : null,
    currency0: row.currency0 == null ? null : String(row.currency0).toLowerCase(),
    currency1: row.currency1 == null ? null : String(row.currency1).toLowerCase(),
    tickSpacing:
      tickSpacing != null && Number.isFinite(tickSpacing) ? tickSpacing : null,
    hooks: row.hooks == null ? null : String(row.hooks).toLowerCase(),
    creatorFeesLifetimeEthRaw: creatorEth?.raw ?? null,
    creatorFeesLifetimeEthDisplay: creatorEth?.display ?? null,
    buybackFeesLifetimeEthRaw: buybackEth?.raw ?? null,
    buybackFeesLifetimeEthDisplay: buybackEth?.display ?? null,
    creatorFeeDistributions,
    buybackFeeDistributions,
  };
}
