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
}

export async function upsertTokenMarketState(
  db: Queryable,
  row: TokenMarketStateRow,
): Promise<void> {
  await db.query(
    `INSERT INTO token_market_state (
      chain_id, token_address, pool_id, sqrt_price_x96, tick, price_quote_x18,
      quote_usd_x18, price_usd_x18, fdv_usd_x18, liquidity_raw,
      source_block, source_tx_hash, source_log_index
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
    ],
  );
}
