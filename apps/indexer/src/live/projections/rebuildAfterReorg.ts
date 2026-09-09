import type { Queryable } from '@scoop/db';
import { scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import {
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  normalizeAddress,
  normalizeBytes32,
} from '@scoop/shared';
import {
  bucketStartFor,
  mergeTradeIntoMinuteCandle,
  upsertLeafCandle,
  upsertMinuteAndRollups,
  type MinuteCandle,
} from './candles.js';
import { applyHolderTransfer } from './holders.js';
import { refreshTokenMarketFromTrades } from './market.js';
import { parseTradeTimestampSec } from './enrichTokenUsd.js';

type AffectedToken = { token_address: string; pool_id: string };

/**
 * After fact-table rollback, rebuild candles + holders + market for affected tokens
 * from remaining canonical rows. Required before indexing past RPC `safe`.
 */
export async function rebuildProjectionsAfterReorg(
  db: Queryable,
  args: {
    chainId: number;
    affected: AffectedToken[];
    quoteUsdMaxAgeSeconds?: number;
  },
): Promise<void> {
  const poolManager = normalizeAddress(scoopV1MainnetCanaryManifest.contracts.PoolManager);
  const positionManager = normalizeAddress(
    scoopV1MainnetCanaryManifest.contracts.PositionManager,
  );

  for (const row of args.affected) {
    const token = normalizeAddress(row.token_address);
    const poolId = normalizeBytes32(row.pool_id);

    const launch = await db.query<{
      tick_lower: number;
      tick_upper: number;
      opening_sqrt_price_x96: string;
      pool_id: string;
      factory_address: string;
      liquidity_locker_address: string;
      fee_distributor_address: string;
      quote_asset: string;
    }>(
      `SELECT tick_lower, tick_upper, opening_sqrt_price_x96, pool_id,
              factory_address, liquidity_locker_address, fee_distributor_address, quote_asset
       FROM launches WHERE chain_id = $1 AND token_address = $2`,
      [args.chainId, token],
    );
    const L = launch.rows[0];
    if (!L) continue;

    await rebuildCandlesFromTrades(db, {
      chainId: args.chainId,
      tokenAddress: token,
      poolId,
    });

    await rebuildHoldersFromTransfers(db, {
      chainId: args.chainId,
      tokenAddress: token,
      systemAddresses: new Set<string>([
        normalizeAddress(L.factory_address),
        poolManager,
        positionManager,
        normalizeAddress(L.liquidity_locker_address),
        normalizeAddress(L.fee_distributor_address),
        DEAD_ADDRESS,
        ZERO_ADDRESS,
      ]),
    });

    const lastTrade = await db.query<{
      sqrt_price_x96_after: string;
      tick_after: number;
      liquidity_after_raw: string;
      block_number: string;
      tx_hash: string;
      log_index: number;
    }>(
      `SELECT sqrt_price_x96_after, tick_after, liquidity_after_raw, block_number, tx_hash, log_index
       FROM trades
       WHERE chain_id = $1 AND token_address = $2
       ORDER BY block_number DESC, log_index DESC LIMIT 1`,
      [args.chainId, token],
    );
    const t = lastTrade.rows[0];
    if (!t) {
      await db.query(
        `DELETE FROM token_market_state WHERE chain_id = $1 AND token_address = $2`,
        [args.chainId, token],
      );
      continue;
    }

    await refreshTokenMarketFromTrades(db, {
      chainId: args.chainId,
      tokenAddress: token,
      poolId: L.pool_id,
      tickLower: L.tick_lower,
      tickUpper: L.tick_upper,
      openingSqrtPriceX96: BigInt(L.opening_sqrt_price_x96),
      liquidityRaw: BigInt(t.liquidity_after_raw),
      sqrtPriceX96: BigInt(t.sqrt_price_x96_after),
      tick: t.tick_after,
      sourceBlock: BigInt(t.block_number),
      sourceTxHash: t.tx_hash,
      sourceLogIndex: t.log_index,
      quoteAsset: L.quote_asset,
      quoteUsdMaxAgeSeconds: args.quoteUsdMaxAgeSeconds,
    });
  }
}

async function rebuildCandlesFromTrades(
  db: Queryable,
  args: { chainId: number; tokenAddress: string; poolId: string },
): Promise<void> {
  await db.query(`DELETE FROM candles WHERE chain_id = $1 AND pool_id = $2`, [
    args.chainId,
    args.poolId,
  ]);

  const trades = await db.query<{
    block_number: string;
    block_timestamp: string;
    side: 'buy' | 'sell';
    quote_amount_raw: string;
    token_amount_raw: string;
    execution_price_quote_x18: string;
    execution_price_usd_x18: string | null;
    usd_value_x18: string | null;
  }>(
    `SELECT block_number::text, block_timestamp::text, side,
            quote_amount_raw::text, token_amount_raw::text,
            execution_price_quote_x18::text,
            execution_price_usd_x18::text AS execution_price_usd_x18,
            usd_value_x18::text AS usd_value_x18
     FROM trades
     WHERE chain_id = $1 AND token_address = $2
     ORDER BY block_number ASC, log_index ASC`,
    [args.chainId, args.tokenAddress],
  );

  const byFiveSec = new Map<number, MinuteCandle>();
  const byMinute = new Map<number, MinuteCandle>();
  for (const trade of trades.rows) {
    const ts = parseTradeTimestampSec(trade.block_timestamp);
    const mergeArgs = {
      priceQuoteX18: BigInt(trade.execution_price_quote_x18),
      quoteAmountRaw: BigInt(trade.quote_amount_raw),
      tokenAmountRaw: BigInt(trade.token_amount_raw),
      side: trade.side,
      blockNumber: Number(trade.block_number),
      priceUsdX18:
        trade.execution_price_usd_x18 != null ? BigInt(trade.execution_price_usd_x18) : null,
      usdValueX18: trade.usd_value_x18 != null ? BigInt(trade.usd_value_x18) : null,
    };
    const fiveStart = bucketStartFor('5s', ts);
    byFiveSec.set(
      fiveStart,
      mergeTradeIntoMinuteCandle(byFiveSec.get(fiveStart) ?? null, {
        ...mergeArgs,
        bucketStart: fiveStart,
      }),
    );
    const minuteStart = bucketStartFor('1m', ts);
    byMinute.set(
      minuteStart,
      mergeTradeIntoMinuteCandle(byMinute.get(minuteStart) ?? null, {
        ...mergeArgs,
        bucketStart: minuteStart,
      }),
    );
  }

  for (const candle of [...byFiveSec.values()].sort((a, b) => a.bucketStart - b.bucketStart)) {
    await upsertLeafCandle(db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      poolId: args.poolId,
      interval: '5s',
      candle,
    });
  }
  for (const candle of [...byMinute.values()].sort((a, b) => a.bucketStart - b.bucketStart)) {
    await upsertMinuteAndRollups(db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      poolId: args.poolId,
      candle,
    });
  }
}

async function rebuildHoldersFromTransfers(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    systemAddresses: Set<string>;
  },
): Promise<void> {
  await db.query(`DELETE FROM holder_balances WHERE chain_id = $1 AND token_address = $2`, [
    args.chainId,
    args.tokenAddress,
  ]);

  const transfers = await db.query<{
    from_address: string;
    to_address: string;
    amount_raw: string;
    block_number: string;
  }>(
    `SELECT from_address, to_address, amount_raw::text, block_number::text
     FROM transfers
     WHERE chain_id = $1 AND token_address = $2
     ORDER BY block_number ASC, log_index ASC`,
    [args.chainId, args.tokenAddress],
  );

  for (const t of transfers.rows) {
    await applyHolderTransfer(db, {
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      transfer: {
        from: t.from_address,
        to: t.to_address,
        amount: BigInt(t.amount_raw),
        blockNumber: Number(t.block_number),
      },
      systemAddresses: args.systemAddresses,
    });
  }
}
