import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface TokenMarketStateRow {
  chainId: number;
  tokenAddress: string;
  poolId: string;
  sqrtPriceX96: string | bigint;
  tick: number;
  priceQuoteX18: string | bigint;
  quoteUsdX18?: string | bigint | null;
  priceUsdX18?: string | bigint | null;
  fdvUsdX18?: string | bigint | null;
  liquidityRaw: string | bigint;
  sourceBlock: number | bigint;
  sourceTxHash?: string | null;
  sourceLogIndex?: number | null;
  launchProgressBps?: number;
  launchComplete?: boolean;
  lastTradeAt?: number | bigint | null;
  lastTradeBlock?: number | bigint | null;
  tradeCountAllTime?: number;
  buyCountAllTime?: number;
  sellCountAllTime?: number;
  quoteVolumeAllTimeRaw?: string | bigint;
  tokenVolumeAllTimeRaw?: string | bigint;
  volume24hQuoteRaw?: string | bigint;
  /** Null when any 24h trade lacks usd_value_x18 (incomplete coverage). */
  volume24hUsdX18?: string | bigint | null;
  tradeCount24h?: number;
  buyCount24h?: number;
  sellCount24h?: number;
  priceChange24hBps?: number | null;
  holderCountAll?: number;
  holderCountRetail?: number;
  initialTokenInventoryRaw?: string | bigint | null;
  currentTokenInventoryRaw?: string | bigint | null;
}

export async function upsertTokenMarketState(
  db: Queryable,
  row: TokenMarketStateRow,
): Promise<void> {
  await db.query(
    `INSERT INTO token_market_state (
      chain_id, token_address, pool_id, sqrt_price_x96, tick, price_quote_x18,
      quote_usd_x18, price_usd_x18, fdv_usd_x18, liquidity_raw,
      source_block, source_tx_hash, source_log_index,
      launch_progress_bps, launch_complete,
      last_trade_at, last_trade_block,
      trade_count_all_time, buy_count_all_time, sell_count_all_time,
      quote_volume_all_time_raw, token_volume_all_time_raw,
      volume_24h_quote_raw, volume_24h_usd_x18, trade_count_24h, buy_count_24h, sell_count_24h,
      price_change_24h_bps, holder_count_all, holder_count_retail,
      initial_token_inventory_raw, current_token_inventory_raw
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
    )
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
      pool_id = EXCLUDED.pool_id,
      sqrt_price_x96 = EXCLUDED.sqrt_price_x96,
      tick = EXCLUDED.tick,
      price_quote_x18 = EXCLUDED.price_quote_x18,
      quote_usd_x18 = EXCLUDED.quote_usd_x18,
      price_usd_x18 = EXCLUDED.price_usd_x18,
      fdv_usd_x18 = EXCLUDED.fdv_usd_x18,
      liquidity_raw = EXCLUDED.liquidity_raw,
      source_block = EXCLUDED.source_block,
      source_tx_hash = EXCLUDED.source_tx_hash,
      source_log_index = EXCLUDED.source_log_index,
      launch_progress_bps = COALESCE(EXCLUDED.launch_progress_bps, token_market_state.launch_progress_bps),
      launch_complete = COALESCE(EXCLUDED.launch_complete, token_market_state.launch_complete),
      last_trade_at = COALESCE(EXCLUDED.last_trade_at, token_market_state.last_trade_at),
      last_trade_block = COALESCE(EXCLUDED.last_trade_block, token_market_state.last_trade_block),
      trade_count_all_time = COALESCE(EXCLUDED.trade_count_all_time, token_market_state.trade_count_all_time),
      buy_count_all_time = COALESCE(EXCLUDED.buy_count_all_time, token_market_state.buy_count_all_time),
      sell_count_all_time = COALESCE(EXCLUDED.sell_count_all_time, token_market_state.sell_count_all_time),
      quote_volume_all_time_raw = COALESCE(EXCLUDED.quote_volume_all_time_raw, token_market_state.quote_volume_all_time_raw),
      token_volume_all_time_raw = COALESCE(EXCLUDED.token_volume_all_time_raw, token_market_state.token_volume_all_time_raw),
      volume_24h_quote_raw = COALESCE(EXCLUDED.volume_24h_quote_raw, token_market_state.volume_24h_quote_raw),
      volume_24h_usd_x18 = EXCLUDED.volume_24h_usd_x18,
      trade_count_24h = COALESCE(EXCLUDED.trade_count_24h, token_market_state.trade_count_24h),
      buy_count_24h = COALESCE(EXCLUDED.buy_count_24h, token_market_state.buy_count_24h),
      sell_count_24h = COALESCE(EXCLUDED.sell_count_24h, token_market_state.sell_count_24h),
      price_change_24h_bps = COALESCE(EXCLUDED.price_change_24h_bps, token_market_state.price_change_24h_bps),
      holder_count_all = COALESCE(EXCLUDED.holder_count_all, token_market_state.holder_count_all),
      holder_count_retail = COALESCE(EXCLUDED.holder_count_retail, token_market_state.holder_count_retail),
      initial_token_inventory_raw = COALESCE(EXCLUDED.initial_token_inventory_raw, token_market_state.initial_token_inventory_raw),
      current_token_inventory_raw = COALESCE(EXCLUDED.current_token_inventory_raw, token_market_state.current_token_inventory_raw),
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      normalizeBytes32(row.poolId),
      toNumericString(row.sqrtPriceX96),
      row.tick,
      toNumericString(row.priceQuoteX18),
      row.quoteUsdX18 == null ? null : toNumericString(row.quoteUsdX18),
      row.priceUsdX18 == null ? null : toNumericString(row.priceUsdX18),
      row.fdvUsdX18 == null ? null : toNumericString(row.fdvUsdX18),
      toNumericString(row.liquidityRaw),
      toNumericString(row.sourceBlock),
      row.sourceTxHash ? normalizeBytes32(row.sourceTxHash) : null,
      row.sourceLogIndex ?? null,
      row.launchProgressBps ?? 0,
      row.launchComplete ?? false,
      row.lastTradeAt == null ? null : toNumericString(row.lastTradeAt),
      row.lastTradeBlock == null ? null : toNumericString(row.lastTradeBlock),
      row.tradeCountAllTime ?? 0,
      row.buyCountAllTime ?? 0,
      row.sellCountAllTime ?? 0,
      toNumericString(row.quoteVolumeAllTimeRaw ?? 0),
      toNumericString(row.tokenVolumeAllTimeRaw ?? 0),
      toNumericString(row.volume24hQuoteRaw ?? 0),
      row.volume24hUsdX18 == null ? null : toNumericString(row.volume24hUsdX18),
      row.tradeCount24h ?? 0,
      row.buyCount24h ?? 0,
      row.sellCount24h ?? 0,
      row.priceChange24hBps ?? null,
      row.holderCountAll ?? 0,
      row.holderCountRetail ?? 0,
      row.initialTokenInventoryRaw == null
        ? null
        : toNumericString(row.initialTokenInventoryRaw),
      row.currentTokenInventoryRaw == null
        ? null
        : toNumericString(row.currentTokenInventoryRaw),
    ],
  );
}

export interface QuoteMarketRevaluationRow {
  tokenAddress: string;
  priceQuoteX18: string;
  totalSupplyRaw: string;
  tokenDecimals: number;
  lastTradeAt: string | null;
  volume24hUsdX18: string | null;
  volume24hQuoteRaw: string;
}

/** Markets on a quote asset that have a quote-denominated spot price. */
export async function listMarketsForQuoteUsdRevaluation(
  db: Queryable,
  chainId: number,
  quoteAsset: string,
): Promise<QuoteMarketRevaluationRow[]> {
  const quote = normalizeAddress(quoteAsset);
  const result = await db.query<{
    token_address: string;
    price_quote_x18: string;
    total_supply_raw: string;
    decimals: number;
    last_trade_at: string | null;
    volume_24h_usd_x18: string | null;
    volume_24h_quote_raw: string;
  }>(
    `SELECT
       m.token_address,
       m.price_quote_x18::text AS price_quote_x18,
       t.total_supply_raw::text AS total_supply_raw,
       t.decimals,
       m.last_trade_at::text AS last_trade_at,
       m.volume_24h_usd_x18::text AS volume_24h_usd_x18,
       COALESCE(m.volume_24h_quote_raw, 0)::text AS volume_24h_quote_raw
     FROM token_market_state m
     INNER JOIN launches l
       ON l.chain_id = m.chain_id AND l.token_address = m.token_address
     INNER JOIN tokens t
       ON t.chain_id = m.chain_id AND t.token_address = m.token_address
     WHERE m.chain_id = $1
       AND l.quote_asset = $2
       AND m.price_quote_x18 IS NOT NULL`,
    [chainId, quote],
  );
  return result.rows.map((row) => ({
    tokenAddress: normalizeAddress(row.token_address),
    priceQuoteX18: String(row.price_quote_x18),
    totalSupplyRaw: String(row.total_supply_raw),
    tokenDecimals: Number(row.decimals),
    lastTradeAt: row.last_trade_at == null ? null : String(row.last_trade_at),
    volume24hUsdX18: row.volume_24h_usd_x18 == null ? null : String(row.volume_24h_usd_x18),
    volume24hQuoteRaw: String(row.volume_24h_quote_raw),
  }));
}

/**
 * Update only quote/USD valuation fields. Does not touch trade metrics,
 * volume, liquidity, or last_trade_at. Bumps updated_at (generic projection clock).
 */
export async function updateTokenMarketUsdValuation(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    quoteUsdX18: string | bigint;
    priceUsdX18: string | bigint;
    fdvUsdX18: string | bigint;
  },
): Promise<void> {
  await db.query(
    `UPDATE token_market_state
     SET quote_usd_x18 = $3,
         price_usd_x18 = $4,
         fdv_usd_x18 = $5,
         updated_at = NOW()
     WHERE chain_id = $1 AND token_address = $2`,
    [
      input.chainId,
      normalizeAddress(input.tokenAddress),
      toNumericString(input.quoteUsdX18),
      toNumericString(input.priceUsdX18),
      toNumericString(input.fdvUsdX18),
    ],
  );
}
