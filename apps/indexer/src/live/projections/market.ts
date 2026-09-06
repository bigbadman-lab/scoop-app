import type { Queryable } from '@scoop/db';
import { upsertTokenMarketState } from '@scoop/db';
import {
  getSqrtRatioAtTick,
  computeLaunchProgress,
  priceQuoteX18FromSqrt,
  normalizeAddress,
} from '@scoop/shared';

export interface TradeMetricInput {
  side: 'buy' | 'sell';
  quoteAmountRaw: bigint;
  tokenAmountRaw: bigint;
  blockTimestamp: bigint;
  blockNumber: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  liquidityRaw: bigint;
  txHash: string;
  logIndex: number;
  poolId: string;
}

/** Recompute market state + progress + all-time/24h metrics from trades table. */
export async function refreshTokenMarketFromTrades(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    openingSqrtPriceX96: bigint;
    liquidityRaw: bigint;
    sqrtPriceX96: bigint;
    tick: number;
    sourceBlock: bigint;
    sourceTxHash: string;
    sourceLogIndex: number;
    tokenIsCurrency1?: boolean;
    dustRaw?: bigint;
    nowSec?: number;
    quoteDecimals?: number;
  },
): Promise<void> {
  const token = normalizeAddress(args.tokenAddress);
  const tokenIsCurrency1 = args.tokenIsCurrency1 ?? true;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const windowStart = nowSec - 86400;

  const metrics = await db.query<{
    trade_count: string;
    buy_count: string;
    sell_count: string;
    quote_volume: string;
    token_volume: string;
    last_trade_at: string | null;
    last_trade_block: string | null;
  }>(
    `SELECT
      COUNT(*)::text AS trade_count,
      COUNT(*) FILTER (WHERE side = 'buy')::text AS buy_count,
      COUNT(*) FILTER (WHERE side = 'sell')::text AS sell_count,
      COALESCE(SUM(quote_amount_raw), 0)::text AS quote_volume,
      COALESCE(SUM(token_amount_raw), 0)::text AS token_volume,
      MAX(block_timestamp)::text AS last_trade_at,
      MAX(block_number)::text AS last_trade_block
     FROM trades
     WHERE chain_id = $1 AND token_address = $2`,
    [args.chainId, token],
  );

  const m24 = await db.query<{
    trade_count: string;
    buy_count: string;
    sell_count: string;
    quote_volume: string;
    first_price: string | null;
    last_price: string | null;
  }>(
    `SELECT
      COUNT(*)::text AS trade_count,
      COUNT(*) FILTER (WHERE side = 'buy')::text AS buy_count,
      COUNT(*) FILTER (WHERE side = 'sell')::text AS sell_count,
      COALESCE(SUM(quote_amount_raw), 0)::text AS quote_volume,
      (ARRAY_AGG(execution_price_quote_x18 ORDER BY block_number ASC, log_index ASC))[1]::text AS first_price,
      (ARRAY_AGG(execution_price_quote_x18 ORDER BY block_number DESC, log_index DESC))[1]::text AS last_price
     FROM trades
     WHERE chain_id = $1 AND token_address = $2 AND block_timestamp >= $3`,
    [args.chainId, token, windowStart],
  );

  const holders = await db.query<{ all_count: string; retail_count: string }>(
    `SELECT
      COUNT(*) FILTER (WHERE balance_raw > 0)::text AS all_count,
      COUNT(*) FILTER (WHERE balance_raw > 0 AND is_system_address = FALSE)::text AS retail_count
     FROM holder_balances
     WHERE chain_id = $1 AND token_address = $2`,
    [args.chainId, token],
  );

  const existing = await db.query<{ initial_token_inventory_raw: string | null }>(
    `SELECT initial_token_inventory_raw FROM token_market_state
     WHERE chain_id = $1 AND token_address = $2`,
    [args.chainId, token],
  );

  const sqrtLower = getSqrtRatioAtTick(args.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(args.tickUpper);
  const initialStored = existing.rows[0]?.initial_token_inventory_raw;
  const progress = computeLaunchProgress({
    liquidity: args.liquidityRaw > 0n ? args.liquidityRaw : 1n,
    sqrtPriceX96: args.sqrtPriceX96,
    sqrtLower,
    sqrtUpper,
    tokenIsCurrency1,
    openingSqrtPriceX96: args.openingSqrtPriceX96,
    initialTokenInventory: initialStored != null ? BigInt(initialStored) : undefined,
    dustRaw: args.dustRaw,
  });

  const priceQuote = priceQuoteX18FromSqrt({
    sqrtPriceX96: args.sqrtPriceX96,
    tokenIsCurrency1,
    quoteDecimals: args.quoteDecimals ?? 18,
  });

  let priceChange24hBps: number | null = null;
  const firstPx = m24.rows[0]?.first_price;
  const lastPx = m24.rows[0]?.last_price;
  if (firstPx && lastPx && BigInt(firstPx) > 0n) {
    priceChange24hBps = Number(
      ((BigInt(lastPx) - BigInt(firstPx)) * 10000n) / BigInt(firstPx),
    );
  }

  const all = metrics.rows[0];
  const day = m24.rows[0];
  const h = holders.rows[0];

  await upsertTokenMarketState(db, {
    chainId: args.chainId,
    tokenAddress: token,
    poolId: args.poolId,
    sqrtPriceX96: args.sqrtPriceX96,
    tick: args.tick,
    priceQuoteX18: priceQuote,
    liquidityRaw: args.liquidityRaw,
    sourceBlock: args.sourceBlock,
    sourceTxHash: args.sourceTxHash,
    sourceLogIndex: args.sourceLogIndex,
    launchProgressBps: progress.progressBps,
    launchComplete: progress.complete,
    lastTradeAt: all?.last_trade_at == null ? null : BigInt(all.last_trade_at),
    lastTradeBlock: all?.last_trade_block == null ? null : BigInt(all.last_trade_block),
    tradeCountAllTime: Number(all?.trade_count ?? 0),
    buyCountAllTime: Number(all?.buy_count ?? 0),
    sellCountAllTime: Number(all?.sell_count ?? 0),
    quoteVolumeAllTimeRaw: all?.quote_volume ?? '0',
    tokenVolumeAllTimeRaw: all?.token_volume ?? '0',
    volume24hQuoteRaw: day?.quote_volume ?? '0',
    tradeCount24h: Number(day?.trade_count ?? 0),
    buyCount24h: Number(day?.buy_count ?? 0),
    sellCount24h: Number(day?.sell_count ?? 0),
    priceChange24hBps,
    holderCountAll: Number(h?.all_count ?? 0),
    holderCountRetail: Number(h?.retail_count ?? 0),
    initialTokenInventoryRaw: progress.initialTokenInventory,
    currentTokenInventoryRaw: progress.currentTokenInventory,
  });
}
