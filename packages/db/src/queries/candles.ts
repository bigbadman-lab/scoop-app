import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { clampLimit, formatX18 } from '../decimal.js';
import type { CandleInterval, CandleItem } from '../dto.js';

const ALLOWED_INTERVALS = new Set<CandleInterval>([
  '5s',
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
]);

export interface GetCandlesOptions {
  from?: number;
  to?: number;
  limit?: number;
}

export function assertCandleInterval(interval: string): CandleInterval {
  if (!ALLOWED_INTERVALS.has(interval as CandleInterval)) {
    throw new Error(`Invalid candle interval: ${interval}`);
  }
  return interval as CandleInterval;
}

export async function getCandles(
  db: Queryable,
  chainId: number,
  tokenAddressInput: string,
  intervalInput: string,
  options: GetCandlesOptions = {},
): Promise<CandleItem[]> {
  const tokenAddress = normalizeAddress(tokenAddressInput);
  const interval = assertCandleInterval(intervalInput);
  const limit = clampLimit(options.limit, 500, 100);

  const params: unknown[] = [chainId, tokenAddress, interval];
  const clauses = ['c.chain_id = $1', 'c.token_address = $2', 'c.interval = $3'];

  if (options.from != null) {
    params.push(options.from);
    clauses.push(`c.bucket_start >= $${params.length}`);
  }
  if (options.to != null) {
    params.push(options.to);
    clauses.push(`c.bucket_start <= $${params.length}`);
  }

  params.push(limit);
  const limitParam = params.length;

  const result = await db.query(
    `
    SELECT
      c.chain_id,
      c.token_address,
      c.pool_id,
      c.interval,
      c.bucket_start,
      c.open_quote_x18::text AS open_quote_x18,
      c.high_quote_x18::text AS high_quote_x18,
      c.low_quote_x18::text AS low_quote_x18,
      c.close_quote_x18::text AS close_quote_x18,
      c.quote_volume_raw::text AS quote_volume_raw,
      c.token_volume_raw::text AS token_volume_raw,
      c.trade_count,
      c.buy_count,
      c.sell_count,
      c.open_usd_x18::text AS open_usd_x18,
      c.high_usd_x18::text AS high_usd_x18,
      c.low_usd_x18::text AS low_usd_x18,
      c.close_usd_x18::text AS close_usd_x18,
      c.usd_volume_x18::text AS usd_volume_x18
    FROM candles c
    WHERE ${clauses.join(' AND ')}
    ORDER BY c.bucket_start DESC
    LIMIT $${limitParam}
    `,
    params,
  );

  return result.rows.map((row) => {
    const open = String(row.open_quote_x18);
    const high = String(row.high_quote_x18);
    const low = String(row.low_quote_x18);
    const close = String(row.close_quote_x18);

    return {
      chainId: Number(row.chain_id),
      tokenAddress: String(row.token_address),
      poolId: String(row.pool_id),
      interval: String(row.interval),
      bucketStart: Number(row.bucket_start),
      openQuoteX18: open,
      highQuoteX18: high,
      lowQuoteX18: low,
      closeQuoteX18: close,
      openQuoteDisplay: formatX18(open) ?? '0',
      highQuoteDisplay: formatX18(high) ?? '0',
      lowQuoteDisplay: formatX18(low) ?? '0',
      closeQuoteDisplay: formatX18(close) ?? '0',
      quoteVolumeRaw: String(row.quote_volume_raw),
      tokenVolumeRaw: String(row.token_volume_raw),
      tradeCount: Number(row.trade_count),
      buyCount: Number(row.buy_count),
      sellCount: Number(row.sell_count),
      openUsdX18: row.open_usd_x18 == null ? null : String(row.open_usd_x18),
      highUsdX18: row.high_usd_x18 == null ? null : String(row.high_usd_x18),
      lowUsdX18: row.low_usd_x18 == null ? null : String(row.low_usd_x18),
      closeUsdX18: row.close_usd_x18 == null ? null : String(row.close_usd_x18),
      usdVolumeX18: row.usd_volume_x18 == null ? null : String(row.usd_volume_x18),
    } satisfies CandleItem;
  });
}
