import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface CandleRow {
  chainId: number;
  tokenAddress: string;
  poolId: string;
  interval: string;
  bucketStart: number | bigint;
  openQuoteX18: string | bigint;
  highQuoteX18: string | bigint;
  lowQuoteX18: string | bigint;
  closeQuoteX18: string | bigint;
  quoteVolumeRaw: string | bigint;
  tokenVolumeRaw: string | bigint;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  openUsdX18?: string | bigint | null;
  highUsdX18?: string | bigint | null;
  lowUsdX18?: string | bigint | null;
  closeUsdX18?: string | bigint | null;
  usdVolumeX18?: string | bigint | null;
  firstTradeBlock?: number | bigint | null;
  lastTradeBlock?: number | bigint | null;
}

export async function upsertCandle(db: Queryable, row: CandleRow): Promise<void> {
  await db.query(
    `INSERT INTO candles (
      chain_id, token_address, pool_id, interval, bucket_start,
      open_quote_x18, high_quote_x18, low_quote_x18, close_quote_x18,
      quote_volume_raw, token_volume_raw, trade_count, buy_count, sell_count,
      open_usd_x18, high_usd_x18, low_usd_x18, close_usd_x18, usd_volume_x18,
      first_trade_block, last_trade_block
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    )
    ON CONFLICT (chain_id, pool_id, interval, bucket_start) DO UPDATE SET
      token_address = EXCLUDED.token_address,
      open_quote_x18 = EXCLUDED.open_quote_x18,
      high_quote_x18 = EXCLUDED.high_quote_x18,
      low_quote_x18 = EXCLUDED.low_quote_x18,
      close_quote_x18 = EXCLUDED.close_quote_x18,
      quote_volume_raw = EXCLUDED.quote_volume_raw,
      token_volume_raw = EXCLUDED.token_volume_raw,
      trade_count = EXCLUDED.trade_count,
      buy_count = EXCLUDED.buy_count,
      sell_count = EXCLUDED.sell_count,
      open_usd_x18 = EXCLUDED.open_usd_x18,
      high_usd_x18 = EXCLUDED.high_usd_x18,
      low_usd_x18 = EXCLUDED.low_usd_x18,
      close_usd_x18 = EXCLUDED.close_usd_x18,
      usd_volume_x18 = EXCLUDED.usd_volume_x18,
      first_trade_block = EXCLUDED.first_trade_block,
      last_trade_block = EXCLUDED.last_trade_block,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      normalizeBytes32(row.poolId),
      row.interval,
      toNumericString(row.bucketStart),
      toNumericString(row.openQuoteX18),
      toNumericString(row.highQuoteX18),
      toNumericString(row.lowQuoteX18),
      toNumericString(row.closeQuoteX18),
      toNumericString(row.quoteVolumeRaw),
      toNumericString(row.tokenVolumeRaw),
      row.tradeCount,
      row.buyCount,
      row.sellCount,
      row.openUsdX18 == null ? null : toNumericString(row.openUsdX18),
      row.highUsdX18 == null ? null : toNumericString(row.highUsdX18),
      row.lowUsdX18 == null ? null : toNumericString(row.lowUsdX18),
      row.closeUsdX18 == null ? null : toNumericString(row.closeUsdX18),
      row.usdVolumeX18 == null ? null : toNumericString(row.usdVolumeX18),
      row.firstTradeBlock == null ? null : toNumericString(row.firstTradeBlock),
      row.lastTradeBlock == null ? null : toNumericString(row.lastTradeBlock),
    ],
  );
}
