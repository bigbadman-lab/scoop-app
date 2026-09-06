import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface TradeRow {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  poolId: string;
  tokenAddress: string;
  quoteAsset: string;
  swapSender: string;
  txFrom?: string | null;
  traderAddress?: string | null;
  traderAttributionType: string;
  side: string;
  amount0Raw: string | bigint;
  amount1Raw: string | bigint;
  quoteAmountRaw: string | bigint;
  tokenAmountRaw: string | bigint;
  sqrtPriceX96After: string | bigint;
  tickAfter: number;
  liquidityAfterRaw: string | bigint;
  fee: number;
  executionPriceQuoteX18: string | bigint;
  quoteUsdX18?: string | bigint | null;
  executionPriceUsdX18?: string | bigint | null;
  usdValueX18?: string | bigint | null;
  isInitialBuy?: boolean;
}

export async function upsertTrade(db: Queryable, row: TradeRow): Promise<void> {
  await db.query(
    `INSERT INTO trades (
      chain_id, tx_hash, log_index, block_number, block_hash, block_timestamp,
      pool_id, token_address, quote_asset, swap_sender, tx_from, trader_address,
      trader_attribution_type, side, amount0_raw, amount1_raw, quote_amount_raw, token_amount_raw,
      sqrt_price_x96_after, tick_after, liquidity_after_raw, fee,
      execution_price_quote_x18, quote_usd_x18, execution_price_usd_x18, usd_value_x18, is_initial_buy
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
    )
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      pool_id = EXCLUDED.pool_id,
      token_address = EXCLUDED.token_address,
      quote_asset = EXCLUDED.quote_asset,
      swap_sender = EXCLUDED.swap_sender,
      tx_from = EXCLUDED.tx_from,
      trader_address = EXCLUDED.trader_address,
      trader_attribution_type = EXCLUDED.trader_attribution_type,
      side = EXCLUDED.side,
      amount0_raw = EXCLUDED.amount0_raw,
      amount1_raw = EXCLUDED.amount1_raw,
      quote_amount_raw = EXCLUDED.quote_amount_raw,
      token_amount_raw = EXCLUDED.token_amount_raw,
      sqrt_price_x96_after = EXCLUDED.sqrt_price_x96_after,
      tick_after = EXCLUDED.tick_after,
      liquidity_after_raw = EXCLUDED.liquidity_after_raw,
      fee = EXCLUDED.fee,
      execution_price_quote_x18 = EXCLUDED.execution_price_quote_x18,
      quote_usd_x18 = EXCLUDED.quote_usd_x18,
      execution_price_usd_x18 = EXCLUDED.execution_price_usd_x18,
      usd_value_x18 = EXCLUDED.usd_value_x18,
      is_initial_buy = EXCLUDED.is_initial_buy`,
    [
      row.chainId,
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      normalizeBytes32(row.poolId),
      normalizeAddress(row.tokenAddress),
      normalizeAddress(row.quoteAsset),
      normalizeAddress(row.swapSender),
      row.txFrom ? normalizeAddress(row.txFrom) : null,
      row.traderAddress ? normalizeAddress(row.traderAddress) : null,
      row.traderAttributionType,
      row.side,
      toNumericString(row.amount0Raw),
      toNumericString(row.amount1Raw),
      toNumericString(row.quoteAmountRaw),
      toNumericString(row.tokenAmountRaw),
      toNumericString(row.sqrtPriceX96After),
      row.tickAfter,
      toNumericString(row.liquidityAfterRaw),
      row.fee,
      toNumericString(row.executionPriceQuoteX18),
      row.quoteUsdX18 == null ? null : toNumericString(row.quoteUsdX18),
      row.executionPriceUsdX18 == null ? null : toNumericString(row.executionPriceUsdX18),
      row.usdValueX18 == null ? null : toNumericString(row.usdValueX18),
      row.isInitialBuy ?? false,
    ],
  );
}
