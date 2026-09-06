import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { clampLimit, clampOffset, formatRawAmount, formatX18 } from '../decimal.js';
import type { TradeItem, TradeSide } from '../dto.js';
import { DEFAULT_QUOTE_DECIMALS } from './_discoverySql.js';

export interface GetTradesOptions {
  limit?: number;
  offset?: number;
  /** Cursor: return trades strictly older than this (blockTimestamp, logIndex). */
  beforeTimestamp?: number;
  beforeLogIndex?: number;
  side?: TradeSide;
  quoteDecimals?: number;
  tokenDecimals?: number;
}

export async function getTrades(
  db: Queryable,
  chainId: number,
  tokenAddressInput: string,
  options: GetTradesOptions = {},
): Promise<TradeItem[]> {
  const tokenAddress = normalizeAddress(tokenAddressInput);
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const quoteDecimals = options.quoteDecimals ?? DEFAULT_QUOTE_DECIMALS;
  const tokenDecimals = options.tokenDecimals ?? 18;

  const params: unknown[] = [chainId, tokenAddress];
  const clauses: string[] = ['tr.chain_id = $1', 'tr.token_address = $2'];

  if (options.side === 'buy' || options.side === 'sell') {
    params.push(options.side);
    clauses.push(`tr.side = $${params.length}`);
  }

  if (options.beforeTimestamp != null) {
    params.push(options.beforeTimestamp);
    const tsParam = params.length;
    const logIndex = options.beforeLogIndex ?? Number.MAX_SAFE_INTEGER;
    params.push(logIndex);
    const liParam = params.length;
    clauses.push(
      `(tr.block_timestamp < $${tsParam} OR (tr.block_timestamp = $${tsParam} AND tr.log_index < $${liParam}))`,
    );
  }

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  // confirmation_status lives on raw_chain_events, not trades — left join when available.
  const result = await db.query(
    `
    SELECT
      tr.chain_id,
      tr.tx_hash,
      tr.log_index,
      tr.block_number,
      tr.block_timestamp,
      tr.token_address,
      tr.pool_id,
      tr.side,
      tr.swap_sender,
      tr.tx_from,
      tr.trader_address,
      tr.trader_attribution_type,
      tr.quote_amount_raw::text AS quote_amount_raw,
      tr.token_amount_raw::text AS token_amount_raw,
      tr.execution_price_quote_x18::text AS execution_price_quote_x18,
      tr.usd_value_x18::text AS usd_value_x18,
      tr.is_initial_buy,
      COALESCE(rce.confirmation_status, 'confirmed') AS confirmation_status
    FROM trades tr
    LEFT JOIN raw_chain_events rce
      ON rce.chain_id = tr.chain_id
     AND rce.tx_hash = tr.tx_hash
     AND rce.log_index = tr.log_index
    WHERE ${clauses.join(' AND ')}
    ORDER BY tr.block_timestamp DESC, tr.log_index DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
    `,
    params,
  );

  return result.rows.map((row) => {
    const quoteAmountRaw = String(row.quote_amount_raw);
    const tokenAmountRaw = String(row.token_amount_raw);
    const priceX18 = String(row.execution_price_quote_x18);
    const usdValueX18 = row.usd_value_x18 == null ? null : String(row.usd_value_x18);

    return {
      chainId: Number(row.chain_id),
      txHash: String(row.tx_hash),
      logIndex: Number(row.log_index),
      blockNumber: Number(row.block_number),
      blockTimestamp: Number(row.block_timestamp),
      tokenAddress: String(row.token_address),
      poolId: String(row.pool_id),
      side: String(row.side),
      swapSender: String(row.swap_sender),
      txFrom: row.tx_from == null ? null : String(row.tx_from),
      traderAddress: row.trader_address == null ? null : String(row.trader_address),
      traderAttributionType: String(row.trader_attribution_type),
      quoteAmountRaw,
      quoteAmountDisplay: formatRawAmount(quoteAmountRaw, quoteDecimals),
      tokenAmountRaw,
      tokenAmountDisplay: formatRawAmount(tokenAmountRaw, tokenDecimals),
      executionPriceQuoteX18: priceX18,
      executionPriceQuoteDisplay: formatX18(priceX18) ?? '0',
      usdValueX18,
      usdValueDisplay: formatX18(usdValueX18),
      isInitialBuy: Boolean(row.is_initial_buy),
      confirmationStatus: String(row.confirmation_status ?? 'confirmed'),
    } satisfies TradeItem;
  });
}
