import type { Queryable } from '@scoop/db';
import { upsertCandle, type CandleRow } from '@scoop/db';

/** All stored candle intervals. `5s` is a parallel leaf; higher TFs roll up from `1m` only. */
export type CandleInterval = '5s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/** Intervals rolled up from 1m (never from 5s). */
export type RollupCandleInterval = '5m' | '15m' | '1h' | '4h' | '1d';

/** Trade-aggregated leaf intervals written directly from trades. */
export type LeafCandleInterval = '5s' | '1m';

export const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '5s': 5,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export const ROLLUP_INTERVALS: readonly RollupCandleInterval[] = [
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
] as const;

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
  /** True only when every trade merged so far had trade-time USD. */
  usdComplete: boolean;
  openUsdX18: bigint | null;
  highUsdX18: bigint | null;
  lowUsdX18: bigint | null;
  closeUsdX18: bigint | null;
  usdVolumeX18: bigint | null;
}

/**
 * Merge a trade into an existing leaf candle (pure).
 * Canonical OHLC price = trade execution quote (x18), never post-swap sqrt spot.
 * Missing USD → incomplete USD OHLC (null).
 */
export function mergeTradeIntoMinuteCandle(
  existing: MinuteCandle | null,
  trade: {
    priceQuoteX18: bigint;
    quoteAmountRaw: bigint;
    tokenAmountRaw: bigint;
    side: 'buy' | 'sell';
    blockNumber: number;
    bucketStart: number;
    priceUsdX18?: bigint | null;
    usdValueX18?: bigint | null;
  },
): MinuteCandle {
  const hasUsd =
    trade.priceUsdX18 != null &&
    trade.priceUsdX18 >= 0n &&
    trade.usdValueX18 != null &&
    trade.usdValueX18 >= 0n;

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
      usdComplete: hasUsd,
      openUsdX18: hasUsd ? trade.priceUsdX18! : null,
      highUsdX18: hasUsd ? trade.priceUsdX18! : null,
      lowUsdX18: hasUsd ? trade.priceUsdX18! : null,
      closeUsdX18: hasUsd ? trade.priceUsdX18! : null,
      usdVolumeX18: hasUsd ? trade.usdValueX18! : null,
    };
  }

  const quoteMerged = {
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

  if (!existing.usdComplete || !hasUsd) {
    return {
      ...quoteMerged,
      usdComplete: false,
      openUsdX18: null,
      highUsdX18: null,
      lowUsdX18: null,
      closeUsdX18: null,
      usdVolumeX18: null,
    };
  }

  const px = trade.priceUsdX18!;
  return {
    ...quoteMerged,
    usdComplete: true,
    openUsdX18: existing.openUsdX18,
    highUsdX18:
      existing.highUsdX18 != null && px > existing.highUsdX18 ? px : existing.highUsdX18,
    lowUsdX18: existing.lowUsdX18 != null && px < existing.lowUsdX18 ? px : existing.lowUsdX18,
    closeUsdX18: px,
    usdVolumeX18: (existing.usdVolumeX18 ?? 0n) + trade.usdValueX18!,
  };
}

/** Roll up 1m candles into a higher interval (pure — empty periods omitted). */
export function rollupMinuteCandles(
  minutes: MinuteCandle[],
  interval: RollupCandleInterval,
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
    const usdComplete = sorted.every((c) => c.usdComplete);
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
      usdComplete,
      openUsdX18: usdComplete ? first.openUsdX18 : null,
      highUsdX18: usdComplete
        ? sorted.reduce(
            (h, c) =>
              c.highUsdX18 != null && (h == null || c.highUsdX18 > h) ? c.highUsdX18 : h,
            first.highUsdX18,
          )
        : null,
      lowUsdX18: usdComplete
        ? sorted.reduce(
            (l, c) =>
              c.lowUsdX18 != null && (l == null || c.lowUsdX18 < l) ? c.lowUsdX18 : l,
            first.lowUsdX18,
          )
        : null,
      closeUsdX18: usdComplete ? last.closeUsdX18 : null,
      usdVolumeX18: usdComplete
        ? sorted.reduce((s, c) => s + (c.usdVolumeX18 ?? 0n), 0n)
        : null,
    });
  }
  return out;
}

/** Load an existing leaf candle row as MinuteCandle, or null. */
export async function loadLeafCandle(
  db: Queryable,
  args: {
    chainId: number;
    poolId: string;
    interval: LeafCandleInterval;
    bucketStart: number;
  },
): Promise<MinuteCandle | null> {
  const existingCandle = await db.query<{
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
    open_usd_x18: string | null;
    high_usd_x18: string | null;
    low_usd_x18: string | null;
    close_usd_x18: string | null;
    usd_volume_x18: string | null;
  }>(
    `SELECT open_quote_x18, high_quote_x18, low_quote_x18, close_quote_x18,
            quote_volume_raw, token_volume_raw, trade_count, buy_count, sell_count,
            first_trade_block, last_trade_block,
            open_usd_x18::text AS open_usd_x18, high_usd_x18::text AS high_usd_x18,
            low_usd_x18::text AS low_usd_x18, close_usd_x18::text AS close_usd_x18,
            usd_volume_x18::text AS usd_volume_x18
     FROM candles
     WHERE chain_id = $1 AND pool_id = $2 AND interval = $3 AND bucket_start = $4`,
    [args.chainId, args.poolId, args.interval, args.bucketStart],
  );
  const prevRow = existingCandle.rows[0];
  if (!prevRow) return null;
  const prevHasUsd =
    prevRow.open_usd_x18 != null &&
    prevRow.high_usd_x18 != null &&
    prevRow.low_usd_x18 != null &&
    prevRow.close_usd_x18 != null &&
    prevRow.usd_volume_x18 != null;
  return {
    bucketStart: args.bucketStart,
    openQuoteX18: BigInt(prevRow.open_quote_x18),
    highQuoteX18: BigInt(prevRow.high_quote_x18),
    lowQuoteX18: BigInt(prevRow.low_quote_x18),
    closeQuoteX18: BigInt(prevRow.close_quote_x18),
    quoteVolumeRaw: BigInt(prevRow.quote_volume_raw),
    tokenVolumeRaw: BigInt(prevRow.token_volume_raw),
    tradeCount: prevRow.trade_count,
    buyCount: prevRow.buy_count,
    sellCount: prevRow.sell_count,
    firstTradeBlock: prevRow.first_trade_block ? Number(prevRow.first_trade_block) : null,
    lastTradeBlock: prevRow.last_trade_block ? Number(prevRow.last_trade_block) : null,
    usdComplete: prevHasUsd,
    openUsdX18: prevHasUsd ? BigInt(prevRow.open_usd_x18!) : null,
    highUsdX18: prevHasUsd ? BigInt(prevRow.high_usd_x18!) : null,
    lowUsdX18: prevHasUsd ? BigInt(prevRow.low_usd_x18!) : null,
    closeUsdX18: prevHasUsd ? BigInt(prevRow.close_usd_x18!) : null,
    usdVolumeX18: prevHasUsd ? BigInt(prevRow.usd_volume_x18!) : null,
  };
}

/**
 * Apply one trade into a leaf interval using execution price (canonical candle OHLC).
 */
export async function mergeTradeIntoLeafAndPersist(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    poolId: string;
    interval: LeafCandleInterval;
    blockTimestampSec: number;
    blockNumber: number;
    priceQuoteX18: bigint;
    quoteAmountRaw: bigint;
    tokenAmountRaw: bigint;
    side: 'buy' | 'sell';
    priceUsdX18?: bigint | null;
    usdValueX18?: bigint | null;
  },
): Promise<MinuteCandle> {
  const bucketStart = bucketStartFor(args.interval, args.blockTimestampSec);
  const prev = await loadLeafCandle(db, {
    chainId: args.chainId,
    poolId: args.poolId,
    interval: args.interval,
    bucketStart,
  });
  const merged = mergeTradeIntoMinuteCandle(prev, {
    priceQuoteX18: args.priceQuoteX18,
    quoteAmountRaw: args.quoteAmountRaw,
    tokenAmountRaw: args.tokenAmountRaw,
    side: args.side,
    blockNumber: args.blockNumber,
    bucketStart,
    priceUsdX18: args.priceUsdX18,
    usdValueX18: args.usdValueX18,
  });
  if (args.interval === '1m') {
    await upsertMinuteAndRollups(db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      poolId: args.poolId,
      candle: merged,
    });
  } else {
    await upsertLeafCandle(db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      poolId: args.poolId,
      interval: args.interval,
      candle: merged,
    });
  }
  return merged;
}

function candleToRow(
  base: { chainId: number; tokenAddress: string; poolId: string },
  interval: CandleInterval,
  c: MinuteCandle,
): CandleRow {
  return {
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
    openUsdX18: c.usdComplete ? c.openUsdX18 : null,
    highUsdX18: c.usdComplete ? c.highUsdX18 : null,
    lowUsdX18: c.usdComplete ? c.lowUsdX18 : null,
    closeUsdX18: c.usdComplete ? c.closeUsdX18 : null,
    usdVolumeX18: c.usdComplete ? c.usdVolumeX18 : null,
    firstTradeBlock: c.firstTradeBlock ?? null,
    lastTradeBlock: c.lastTradeBlock ?? null,
  };
}

/** Upsert a leaf candle (`5s` or `1m`) without rolling up higher intervals. */
export async function upsertLeafCandle(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    poolId: string;
    interval: LeafCandleInterval;
    candle: MinuteCandle;
  },
): Promise<void> {
  await upsertCandle(
    db,
    candleToRow(
      {
        chainId: args.chainId,
        tokenAddress: args.tokenAddress,
        poolId: args.poolId,
      },
      args.interval,
      args.candle,
    ),
  );
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

  const toRow = (interval: CandleInterval, c: MinuteCandle): CandleRow =>
    candleToRow(base, interval, c);

  await upsertCandle(db, toRow('1m', args.candle));

  for (const interval of ROLLUP_INTERVALS) {
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
      open_usd_x18: string | null;
      high_usd_x18: string | null;
      low_usd_x18: string | null;
      close_usd_x18: string | null;
      usd_volume_x18: string | null;
    }>(
      `SELECT bucket_start, open_quote_x18, high_quote_x18, low_quote_x18, close_quote_x18,
              quote_volume_raw, token_volume_raw, trade_count, buy_count, sell_count,
              first_trade_block, last_trade_block,
              open_usd_x18::text AS open_usd_x18, high_usd_x18::text AS high_usd_x18,
              low_usd_x18::text AS low_usd_x18, close_usd_x18::text AS close_usd_x18,
              usd_volume_x18::text AS usd_volume_x18
       FROM candles
       WHERE chain_id = $1 AND pool_id = $2 AND interval = '1m'
         AND bucket_start >= $3 AND bucket_start < $4
       ORDER BY bucket_start ASC`,
      [args.chainId, args.poolId, parentStart, parentEnd],
    );
    const minutes: MinuteCandle[] = result.rows.map((r) => {
      const hasUsd =
        r.open_usd_x18 != null &&
        r.high_usd_x18 != null &&
        r.low_usd_x18 != null &&
        r.close_usd_x18 != null &&
        r.usd_volume_x18 != null;
      return {
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
        usdComplete: hasUsd,
        openUsdX18: hasUsd ? BigInt(r.open_usd_x18!) : null,
        highUsdX18: hasUsd ? BigInt(r.high_usd_x18!) : null,
        lowUsdX18: hasUsd ? BigInt(r.low_usd_x18!) : null,
        closeUsdX18: hasUsd ? BigInt(r.close_usd_x18!) : null,
        usdVolumeX18: hasUsd ? BigInt(r.usd_volume_x18!) : null,
      };
    });
    if (!minutes.some((m) => m.bucketStart === args.candle.bucketStart)) {
      minutes.push(args.candle);
    }
    const rolled = rollupMinuteCandles(minutes, interval);
    for (const c of rolled) {
      await upsertCandle(db, toRow(interval, c));
    }
  }
}
