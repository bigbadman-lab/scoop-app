import type { Queryable } from '@scoop/db';
import { HELLO_FIXTURE, normalizeAddress, normalizeBytes32 } from '@scoop/shared';
import { resolveTradeUsdFields } from './usd.js';
import {
  bucketStartFor,
  mergeTradeIntoMinuteCandle,
  upsertMinuteAndRollups,
  type MinuteCandle,
} from './candles.js';
import { refreshTokenMarketFromTrades } from './market.js';

export type EnrichTokenUsdOptions = {
  chainId: number;
  tokenAddress: string;
  quoteUsdMaxAgeSeconds: number;
  dryRun?: boolean;
  log?: (message: string, fields?: Record<string, unknown>) => void;
};

export type EnrichTokenUsdReport = {
  tokenAddress: string;
  poolId: string | null;
  blockRange: { min: number | null; max: number | null };
  tradesFound: number;
  tradesEnriched: number;
  tradesMissingSnapshot: number;
  candlesRebuilt: boolean;
  volume24hUsdX18: string | null;
  lastTradeAt: string | null;
  dryRun: boolean;
  checkpointTouched: false;
};

type TradeRow = {
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_timestamp: string;
  pool_id: string;
  quote_asset: string;
  side: 'buy' | 'sell';
  quote_amount_raw: string;
  token_amount_raw: string;
  execution_price_quote_x18: string;
  sqrt_price_x96_after: string;
  tick_after: number;
  liquidity_after_raw: string;
  quote_usd_x18: string | null;
  execution_price_usd_x18: string | null;
  usd_value_x18: string | null;
};

/** Trades store unix seconds; tolerate ISO text from odd drivers. */
export function parseTradeTimestampSec(raw: string | number): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(`Invalid block_timestamp: ${raw}`);
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  const trimmed = raw.trim();
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && trimmed !== '') {
    return asNum > 1e12 ? Math.floor(asNum / 1000) : Math.floor(asNum);
  }
  const ms = Date.parse(trimmed);
  if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  throw new Error(`Invalid block_timestamp: ${raw}`);
}

/**
 * Token-scoped derived USD replay from DB facts + historical quote snapshots.
 * Does NOT touch indexer_checkpoints / processed_blocks / main stream.
 */
export async function enrichTokenHistoricalUsd(
  db: Queryable,
  options: EnrichTokenUsdOptions,
): Promise<EnrichTokenUsdReport> {
  const log =
    options.log ??
    ((message: string, fields: Record<string, unknown> = {}) => {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          message,
          ...fields,
        }),
      );
    });
  const dryRun = Boolean(options.dryRun);
  const token = normalizeAddress(options.tokenAddress);

  const launch = await db.query<{
    pool_id: string;
    quote_asset: string;
    tick_lower: number;
    tick_upper: number;
    opening_sqrt_price_x96: string;
  }>(
    `SELECT pool_id, quote_asset, tick_lower, tick_upper, opening_sqrt_price_x96
     FROM launches WHERE chain_id = $1 AND token_address = $2`,
    [options.chainId, token],
  );
  const L = launch.rows[0];
  if (!L) {
    throw new Error(`No launch row for token ${token}`);
  }
  const poolId = normalizeBytes32(L.pool_id);
  const quoteAsset = normalizeAddress(L.quote_asset);

  const quoteMeta = await db.query<{ decimals: number | null }>(
    `SELECT decimals FROM quote_assets WHERE chain_id = $1 AND quote_asset = $2`,
    [options.chainId, quoteAsset],
  );
  const quoteDecimals = quoteMeta.rows[0]?.decimals ?? 18;

  const tradesResult = await db.query<TradeRow>(
    `SELECT
       tx_hash, log_index, block_number::text, block_timestamp::text, pool_id,
       quote_asset, side, quote_amount_raw::text, token_amount_raw::text,
       execution_price_quote_x18::text, sqrt_price_x96_after::text, tick_after,
       liquidity_after_raw::text,
       quote_usd_x18::text AS quote_usd_x18,
       execution_price_usd_x18::text AS execution_price_usd_x18,
       usd_value_x18::text AS usd_value_x18
     FROM trades
     WHERE chain_id = $1 AND token_address = $2
     ORDER BY block_number ASC, log_index ASC`,
    [options.chainId, token],
  );
  const trades = tradesResult.rows;

  let minBlock: number | null = null;
  let maxBlock: number | null = null;
  let enriched = 0;
  let missing = 0;

  const enrichedTrades: Array<
    TradeRow & {
      resolvedQuoteUsd: bigint | null;
      resolvedExecUsd: bigint | null;
      resolvedUsdValue: bigint | null;
    }
  > = [];

  for (const trade of trades) {
    const blockNumber = Number(trade.block_number);
    minBlock = minBlock == null ? blockNumber : Math.min(minBlock, blockNumber);
    maxBlock = maxBlock == null ? blockNumber : Math.max(maxBlock, blockNumber);

    const tradeTimestampSec = parseTradeTimestampSec(trade.block_timestamp);
    const resolved = await resolveTradeUsdFields(db, {
      chainId: options.chainId,
      quoteAsset: trade.quote_asset,
      quoteAmountRaw: BigInt(trade.quote_amount_raw),
      executionPriceQuoteX18: BigInt(trade.execution_price_quote_x18),
      quoteDecimals,
      tradeTimestampSec,
      maxAgeSeconds: options.quoteUsdMaxAgeSeconds,
    });

    if (resolved.reason !== 'ok' || resolved.usdValueX18 == null) {
      missing += 1;
      enrichedTrades.push({
        ...trade,
        resolvedQuoteUsd: null,
        resolvedExecUsd: null,
        resolvedUsdValue: null,
      });
      continue;
    }

    enriched += 1;
    enrichedTrades.push({
      ...trade,
      resolvedQuoteUsd: resolved.quoteUsdX18,
      resolvedExecUsd: resolved.executionPriceUsdX18,
      resolvedUsdValue: resolved.usdValueX18,
    });

    if (!dryRun) {
      await db.query(
        `UPDATE trades
         SET quote_usd_x18 = $4,
             execution_price_usd_x18 = $5,
             usd_value_x18 = $6
         WHERE chain_id = $1 AND tx_hash = $2 AND log_index = $3`,
        [
          options.chainId,
          normalizeBytes32(trade.tx_hash),
          trade.log_index,
          resolved.quoteUsdX18!.toString(),
          resolved.executionPriceUsdX18!.toString(),
          resolved.usdValueX18!.toString(),
        ],
      );
    }
  }

  log('token usd enrich trades', {
    token,
    tradesFound: trades.length,
    tradesEnriched: enriched,
    tradesMissingSnapshot: missing,
    dryRun,
  });

  if (!dryRun) {
    await db.query(
      `DELETE FROM candles WHERE chain_id = $1 AND pool_id = $2`,
      [options.chainId, poolId],
    );

    const byMinute = new Map<number, MinuteCandle>();
    for (const trade of enrichedTrades) {
      const bucketStart = bucketStartFor(
        '1m',
        parseTradeTimestampSec(trade.block_timestamp),
      );
      const prev = byMinute.get(bucketStart) ?? null;
      const priceQuote = BigInt(trade.execution_price_quote_x18);
      const merged = mergeTradeIntoMinuteCandle(prev, {
        priceQuoteX18: priceQuote,
        quoteAmountRaw: BigInt(trade.quote_amount_raw),
        tokenAmountRaw: BigInt(trade.token_amount_raw),
        side: trade.side,
        blockNumber: Number(trade.block_number),
        bucketStart,
        priceUsdX18: trade.resolvedExecUsd,
        usdValueX18: trade.resolvedUsdValue,
      });
      byMinute.set(bucketStart, merged);
    }

    const minutes = [...byMinute.values()].sort((a, b) => a.bucketStart - b.bucketStart);
    for (const candle of minutes) {
      await upsertMinuteAndRollups(db, {
        chainId: options.chainId,
        tokenAddress: token,
        poolId,
        candle,
      });
    }

    log('token usd enrich candles rebuilt', {
      token,
      minuteCandles: minutes.length,
    });

    const last = enrichedTrades[enrichedTrades.length - 1];
    if (last) {
      await refreshTokenMarketFromTrades(db, {
        chainId: options.chainId,
        tokenAddress: token,
        poolId,
        tickLower: L.tick_lower,
        tickUpper: L.tick_upper,
        openingSqrtPriceX96: BigInt(L.opening_sqrt_price_x96),
        liquidityRaw: BigInt(last.liquidity_after_raw),
        sqrtPriceX96: BigInt(last.sqrt_price_x96_after),
        tick: last.tick_after,
        sourceBlock: BigInt(last.block_number),
        sourceTxHash: last.tx_hash,
        sourceLogIndex: last.log_index,
        quoteAsset,
        quoteDecimals,
        quoteUsdMaxAgeSeconds: options.quoteUsdMaxAgeSeconds,
      });
    }
  }

  const market = await db.query<{
    volume_24h_usd_x18: string | null;
    last_trade_at: string | null;
  }>(
    `SELECT volume_24h_usd_x18::text AS volume_24h_usd_x18,
            last_trade_at::text AS last_trade_at
     FROM token_market_state
     WHERE chain_id = $1 AND token_address = $2`,
    [options.chainId, token],
  );

  return {
    tokenAddress: token,
    poolId,
    blockRange: { min: minBlock, max: maxBlock },
    tradesFound: trades.length,
    tradesEnriched: enriched,
    tradesMissingSnapshot: missing,
    candlesRebuilt: !dryRun && trades.length > 0,
    volume24hUsdX18: market.rows[0]?.volume_24h_usd_x18 ?? null,
    lastTradeAt: market.rows[0]?.last_trade_at ?? null,
    dryRun,
    checkpointTouched: false,
  };
}

/** Convenience: HELLO canary enrichment. */
export async function enrichHelloHistoricalUsd(
  db: Queryable,
  options: Omit<EnrichTokenUsdOptions, 'chainId' | 'tokenAddress'> & {
    chainId?: number;
    tokenAddress?: string;
  },
): Promise<EnrichTokenUsdReport> {
  return enrichTokenHistoricalUsd(db, {
    chainId: options.chainId ?? HELLO_FIXTURE.chainId,
    tokenAddress: options.tokenAddress ?? HELLO_FIXTURE.token,
    quoteUsdMaxAgeSeconds: options.quoteUsdMaxAgeSeconds,
    dryRun: options.dryRun,
    log: options.log,
  });
}
