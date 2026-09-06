import type { Queryable } from '@scoop/db';
import { upsertCandle, type CandleRow } from '@scoop/db';

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function bucketStartFor(interval: CandleInterval, timestampSec: number): number {
  const size = CANDLE_INTERVAL_SECONDS[interval];
  return Math.floor(timestampSec / size) * size;
}

export interface MinuteCandle {
  bucketStart: number;
  openQuoteX18: bigint;
  highQuoteX18: bigint;
  lowQuoteX18: bigint;
  closeQuoteX18: bigint;
  quoteVolumeRaw: bigint;
  tokenVolumeRaw: bigint;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  firstTradeBlock?: number | null;
  lastTradeBlock?: number | null;
}

/** Merge a trade into an existing 1m candle (pure). */
export function mergeTradeIntoMinuteCandle(
  existing: MinuteCandle | null,
  trade: {
    priceQuoteX18: bigint;
    quoteAmountRaw: bigint;
    tokenAmountRaw: bigint;
    side: 'buy' | 'sell';
    blockNumber: number;
    bucketStart: number;
  },
): MinuteCandle {
  if (!existing) {
    return {
      bucketStart: trade.bucketStart,
      openQuoteX18: trade.priceQuoteX18,
      highQuoteX18: trade.priceQuoteX18,
      lowQuoteX18: trade.priceQuoteX18,
      closeQuoteX18: trade.priceQuoteX18,
      quoteVolumeRaw: trade.quoteAmountRaw,
      tokenVolumeRaw: trade.tokenAmountRaw,
      tradeCount: 1,
      buyCount: trade.side === 'buy' ? 1 : 0,
      sellCount: trade.side === 'sell' ? 1 : 0,
      firstTradeBlock: trade.blockNumber,
      lastTradeBlock: trade.blockNumber,
    };
  }
  return {
    bucketStart: existing.bucketStart,
    openQuoteX18: existing.openQuoteX18,
    highQuoteX18:
      trade.priceQuoteX18 > existing.highQuoteX18 ? trade.priceQuoteX18 : existing.highQuoteX18,
    lowQuoteX18:
      trade.priceQuoteX18 < existing.lowQuoteX18 ? trade.priceQuoteX18 : existing.lowQuoteX18,
    closeQuoteX18: trade.priceQuoteX18,
    quoteVolumeRaw: existing.quoteVolumeRaw + trade.quoteAmountRaw,
    tokenVolumeRaw: existing.tokenVolumeRaw + trade.tokenAmountRaw,
    tradeCount: existing.tradeCount + 1,
    buyCount: existing.buyCount + (trade.side === 'buy' ? 1 : 0),
    sellCount: existing.sellCount + (trade.side === 'sell' ? 1 : 0),
    firstTradeBlock: existing.firstTradeBlock ?? trade.blockNumber,
    lastTradeBlock: trade.blockNumber,
  };
}

/** Roll up 1m candles into a higher interval (pure — empty periods omitted). */
export function rollupMinuteCandles(
  minutes: MinuteCandle[],
  interval: Exclude<CandleInterval, '1m'>,
): MinuteCandle[] {
  const size = CANDLE_INTERVAL_SECONDS[interval];
  const groups = new Map<number, MinuteCandle[]>();
  for (const m of minutes) {
    const start = Math.floor(m.bucketStart / size) * size;
    const list = groups.get(start) ?? [];
    list.push(m);
    groups.set(start, list);
  }
  const out: MinuteCandle[] = [];
  for (const [bucketStart, list] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = list.sort((a, b) => a.bucketStart - b.bucketStart);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    out.push({
      bucketStart,
      openQuoteX18: first.openQuoteX18,
      highQuoteX18: sorted.reduce(
        (h, c) => (c.highQuoteX18 > h ? c.highQuoteX18 : h),
        first.highQuoteX18,
      ),
      lowQuoteX18: sorted.reduce(
        (l, c) => (c.lowQuoteX18 < l ? c.lowQuoteX18 : l),
        first.lowQuoteX18,
      ),
      closeQuoteX18: last.closeQuoteX18,
      quoteVolumeRaw: sorted.reduce((s, c) => s + c.quoteVolumeRaw, 0n),
      tokenVolumeRaw: sorted.reduce((s, c) => s + c.tokenVolumeRaw, 0n),
      tradeCount: sorted.reduce((s, c) => s + c.tradeCount, 0),
      buyCount: sorted.reduce((s, c) => s + c.buyCount, 0),
      sellCount: sorted.reduce((s, c) => s + c.sellCount, 0),
      firstTradeBlock: first.firstTradeBlock ?? null,
      lastTradeBlock: last.lastTradeBlock ?? null,
    });
  }
  return out;
}

export async function upsertMinuteAndRollups(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    poolId: string;
    candle: MinuteCandle;
  },
): Promise<void> {
  const base = {
    chainId: args.chainId,
    tokenAddress: args.tokenAddress,
    poolId: args.poolId,
  };

  const toRow = (interval: CandleInterval, c: MinuteCandle): CandleRow => ({
    ...base,
    interval,
    bucketStart: c.bucketStart,
    openQuoteX18: c.openQuoteX18,
    highQuoteX18: c.highQuoteX18,
    lowQuoteX18: c.lowQuoteX18,
    closeQuoteX18: c.closeQuoteX18,
    quoteVolumeRaw: c.quoteVolumeRaw,
    tokenVolumeRaw: c.tokenVolumeRaw,
    tradeCount: c.tradeCount,
    buyCount: c.buyCount,
    sellCount: c.sellCount,
    firstTradeBlock: c.firstTradeBlock ?? null,
    lastTradeBlock: c.lastTradeBlock ?? null,
  });

  await upsertCandle(db, toRow('1m', args.candle));

  // Load neighboring 1m candles for the higher buckets that include this minute
  const higher: Array<Exclude<CandleInterval, '1m'>> = ['5m', '15m', '1h', '4h', '1d'];
  for (const interval of higher) {
    const size = CANDLE_INTERVAL_SECONDS[interval];
    const parentStart = Math.floor(args.candle.bucketStart / size) * size;
    const parentEnd = parentStart + size;
    const result = await db.query<{
      bucket_start: string;
      open_quote_x18: string;
      high_quote_x18: string;
      low_quote_x18: string;
      close_quote_x18: string;
      quote_volume_raw: string;
      token_volume_raw: string;
      trade_count: number;
      buy_count: number;
      sell_count: number;
      first_trade_block: string | null;
      last_trade_block: string | null;
    }>(
      `SELECT bucket_start, open_quote_x18, high_quote_x18, low_quote_x18, close_quote_x18,
              quote_volume_raw, token_volume_raw, trade_count, buy_count, sell_count,
              first_trade_block, last_trade_block
       FROM candles
       WHERE chain_id = $1 AND pool_id = $2 AND interval = '1m'
         AND bucket_start >= $3 AND bucket_start < $4
       ORDER BY bucket_start ASC`,
      [args.chainId, args.poolId, parentStart, parentEnd],
    );
    const minutes: MinuteCandle[] = result.rows.map((r) => ({
      bucketStart: Number(r.bucket_start),
      openQuoteX18: BigInt(r.open_quote_x18),
      highQuoteX18: BigInt(r.high_quote_x18),
      lowQuoteX18: BigInt(r.low_quote_x18),
      closeQuoteX18: BigInt(r.close_quote_x18),
      quoteVolumeRaw: BigInt(r.quote_volume_raw),
      tokenVolumeRaw: BigInt(r.token_volume_raw),
      tradeCount: r.trade_count,
      buyCount: r.buy_count,
      sellCount: r.sell_count,
      firstTradeBlock: r.first_trade_block == null ? null : Number(r.first_trade_block),
      lastTradeBlock: r.last_trade_block == null ? null : Number(r.last_trade_block),
    }));
    // Ensure the just-written candle is represented even if read-your-writes lags
    if (!minutes.some((m) => m.bucketStart === args.candle.bucketStart)) {
      minutes.push(args.candle);
    }
    const rolled = rollupMinuteCandles(minutes, interval);
    for (const c of rolled) {
      await upsertCandle(db, toRow(interval, c));
    }
  }
}
