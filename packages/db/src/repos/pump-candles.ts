/**
 * Pump candle upserts from normalized trade prices (SOL quote).
 */

import type { Queryable } from '../types.js';
import { PUMP_MARKET_CHAIN_ID } from './pump-trades.js';

export type PumpCandleInterval = '1m' | '5m' | '1h';

export const PUMP_CANDLE_INTERVALS: readonly PumpCandleInterval[] = [
  '1m',
  '5m',
  '1h',
] as const;

export type ApplyPumpCandleTradeInput = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  interval: PumpCandleInterval;
  bucketStart: Date | string;
  priceSol: string;
  solAmount: string;
  tokenAmount: string;
};

const INTERVAL_SECONDS: Record<PumpCandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '1h': 3600,
};

export function pumpCandleBucketStart(
  blockTime: Date,
  interval: PumpCandleInterval,
): Date {
  const sec = Math.floor(blockTime.getTime() / 1000);
  const size = INTERVAL_SECONDS[interval];
  const bucket = Math.floor(sec / size) * size;
  return new Date(bucket * 1000);
}

/**
 * Apply one trade into a candle bucket. Call only for newly inserted trades
 * so duplicates do not double-count volume/trade_count.
 */
export async function applyPumpCandleTrade(
  db: Queryable,
  input: ApplyPumpCandleTradeInput,
): Promise<void> {
  if (input.chainId !== PUMP_MARKET_CHAIN_ID) {
    throw new Error(`Invalid Pump chain_id: ${input.chainId}`);
  }
  const bucket =
    input.bucketStart instanceof Date
      ? input.bucketStart.toISOString()
      : input.bucketStart;

  await db.query(
    `INSERT INTO pump_candles (
      chain_id, mint, interval, bucket_start,
      open_price_sol, high_price_sol, low_price_sol, close_price_sol,
      volume_sol, volume_tokens, trade_count, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$5,$5,$5,$6,$7,1,NOW()
    )
    ON CONFLICT (chain_id, mint, interval, bucket_start) DO UPDATE SET
      high_price_sol = GREATEST(pump_candles.high_price_sol, EXCLUDED.high_price_sol),
      low_price_sol = LEAST(pump_candles.low_price_sol, EXCLUDED.low_price_sol),
      close_price_sol = EXCLUDED.close_price_sol,
      volume_sol = pump_candles.volume_sol + EXCLUDED.volume_sol,
      volume_tokens = pump_candles.volume_tokens + EXCLUDED.volume_tokens,
      trade_count = pump_candles.trade_count + 1,
      updated_at = NOW()`,
    [
      PUMP_MARKET_CHAIN_ID,
      input.mint,
      input.interval,
      bucket,
      input.priceSol,
      input.solAmount,
      input.tokenAmount,
    ],
  );
}
