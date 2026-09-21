import type { Queryable } from '@scoop/db';
import { normalizeAddress } from '@scoop/shared';
import {
  MARKET_VOLUME_24H_WINDOW_SECONDS,
  refreshTokenMarketFromTrades,
} from './market.js';

export type Stale24hMarketCandidate = {
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
  quoteAsset: string;
  tokenIsCurrency1: boolean;
};

export type Expire24hMarketResult = {
  tokenAddress: string;
  ok: boolean;
  error?: string;
};

/**
 * Markets whose materialized 24h fields can still be non-zero and therefore
 * need wall-clock recomputation so trades can age out of the rolling window.
 */
export async function listMarketsNeeding24hRefresh(
  db: Queryable,
  chainId: number,
): Promise<Stale24hMarketCandidate[]> {
  const result = await db.query<{
    token_address: string;
    pool_id: string;
    tick_lower: number;
    tick_upper: number;
    opening_sqrt_price_x96: string;
    liquidity_raw: string;
    sqrt_price_x96: string;
    tick: number;
    source_block: string;
    source_tx_hash: string | null;
    source_log_index: number | null;
    quote_asset: string;
    currency1: string | null;
    last_trade_sqrt: string | null;
    last_trade_tick: number | null;
    last_trade_liq: string | null;
    last_trade_block: string | null;
    last_trade_tx: string | null;
    last_trade_log: number | null;
  }>(
    `SELECT
       m.token_address,
       m.pool_id,
       l.tick_lower,
       l.tick_upper,
       l.opening_sqrt_price_x96::text AS opening_sqrt_price_x96,
       m.liquidity_raw::text AS liquidity_raw,
       m.sqrt_price_x96::text AS sqrt_price_x96,
       m.tick,
       m.source_block::text AS source_block,
       m.source_tx_hash,
       m.source_log_index,
       l.quote_asset,
       p.currency1,
       t.sqrt_price_x96_after::text AS last_trade_sqrt,
       t.tick_after AS last_trade_tick,
       t.liquidity_after_raw::text AS last_trade_liq,
       t.block_number::text AS last_trade_block,
       t.tx_hash AS last_trade_tx,
       t.log_index AS last_trade_log
     FROM token_market_state m
     INNER JOIN launches l
       ON l.chain_id = m.chain_id AND l.token_address = m.token_address
     LEFT JOIN pools p
       ON p.chain_id = m.chain_id AND p.pool_id = m.pool_id
     LEFT JOIN LATERAL (
       SELECT sqrt_price_x96_after, tick_after, liquidity_after_raw, block_number, tx_hash, log_index
       FROM trades
       WHERE chain_id = m.chain_id AND token_address = m.token_address
       ORDER BY block_number DESC, log_index DESC
       LIMIT 1
     ) t ON TRUE
     WHERE m.chain_id = $1
       AND (
         COALESCE(m.volume_24h_quote_raw, 0) > 0
         OR COALESCE(m.trade_count_24h, 0) > 0
         OR COALESCE(m.buy_count_24h, 0) > 0
         OR COALESCE(m.sell_count_24h, 0) > 0
         OR (m.volume_24h_usd_x18 IS NOT NULL AND m.volume_24h_usd_x18 > 0)
         OR m.price_change_24h_bps IS NOT NULL
       )`,
    [chainId],
  );

  const out: Stale24hMarketCandidate[] = [];
  for (const row of result.rows) {
    const tokenAddress = normalizeAddress(row.token_address);
    // Prefer last-trade curve state; fall back to materialized market columns.
    // Never BigInt(null) — incomplete rows (e.g. Pump / sparse markets) must be
    // skipped here: this loop runs outside per-market try/catch and would kill
    // the live runner after every catch-up batch when the sweep interval elapses.
    const sqrtRaw = row.last_trade_sqrt ?? row.sqrt_price_x96;
    const liqRaw = row.last_trade_liq ?? row.liquidity_raw;
    const blockRaw = row.last_trade_block ?? row.source_block;
    const openingRaw = row.opening_sqrt_price_x96;
    const sourceTxHash = row.last_trade_tx ?? row.source_tx_hash;
    const sourceLogIndex = row.last_trade_log ?? row.source_log_index;
    if (
      sqrtRaw == null ||
      liqRaw == null ||
      blockRaw == null ||
      openingRaw == null ||
      sourceTxHash == null ||
      sourceLogIndex == null
    ) {
      continue;
    }
    const tick = row.last_trade_tick ?? row.tick;
    if (tick == null) {
      continue;
    }
    out.push({
      tokenAddress,
      poolId: row.pool_id,
      tickLower: row.tick_lower,
      tickUpper: row.tick_upper,
      openingSqrtPriceX96: BigInt(openingRaw),
      liquidityRaw: BigInt(liqRaw),
      sqrtPriceX96: BigInt(sqrtRaw),
      tick,
      sourceBlock: BigInt(blockRaw),
      sourceTxHash,
      sourceLogIndex,
      quoteAsset: normalizeAddress(row.quote_asset),
      tokenIsCurrency1:
        row.currency1 != null
          ? normalizeAddress(row.currency1) === tokenAddress
          : true,
    });
  }
  return out;
}

/**
 * Recompute 24h market metrics for every candidate using wall-clock nowSec.
 * Per-market failures are isolated — one bad market does not abort the sweep.
 */
export async function refreshStale24hMarketWindows(
  db: Queryable,
  args: {
    chainId: number;
    nowSec?: number;
    quoteUsdMaxAgeSeconds?: number;
    dustRaw?: bigint;
    refreshOne?: typeof refreshTokenMarketFromTrades;
    listCandidates?: typeof listMarketsNeeding24hRefresh;
  },
): Promise<{
  candidates: number;
  refreshed: number;
  failed: number;
  results: Expire24hMarketResult[];
}> {
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const list = args.listCandidates ?? listMarketsNeeding24hRefresh;
  const refreshOne = args.refreshOne ?? refreshTokenMarketFromTrades;
  const candidates = await list(db, args.chainId);

  const results: Expire24hMarketResult[] = [];
  let refreshed = 0;
  let failed = 0;

  for (const market of candidates) {
    try {
      await refreshOne(db, {
        chainId: args.chainId,
        tokenAddress: market.tokenAddress,
        poolId: market.poolId,
        tickLower: market.tickLower,
        tickUpper: market.tickUpper,
        openingSqrtPriceX96: market.openingSqrtPriceX96,
        liquidityRaw: market.liquidityRaw,
        sqrtPriceX96: market.sqrtPriceX96,
        tick: market.tick,
        sourceBlock: market.sourceBlock,
        sourceTxHash: market.sourceTxHash,
        sourceLogIndex: market.sourceLogIndex,
        quoteAsset: market.quoteAsset,
        tokenIsCurrency1: market.tokenIsCurrency1,
        dustRaw: args.dustRaw,
        nowSec,
        quoteUsdMaxAgeSeconds: args.quoteUsdMaxAgeSeconds,
      });
      refreshed += 1;
      results.push({ tokenAddress: market.tokenAddress, ok: true });
    } catch (err) {
      failed += 1;
      results.push({
        tokenAddress: market.tokenAddress,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { candidates: candidates.length, refreshed, failed, results };
}

/**
 * Interval-gated sweep for the live indexer runner.
 * Safe to call every poll; only runs when intervalSeconds have elapsed.
 */
export async function maybeExpireStale24hVolume(args: {
  db: Queryable;
  chainId: number;
  intervalSeconds: number;
  lastSweepAtMs: number;
  nowMs?: number;
  quoteUsdMaxAgeSeconds?: number;
  dustRaw?: bigint;
}): Promise<{
  swept: boolean;
  nextLastAtMs: number;
  candidates: number;
  refreshed: number;
  failed: number;
  results: Expire24hMarketResult[];
  windowSeconds: number;
}> {
  const now = args.nowMs ?? Date.now();
  if (now - args.lastSweepAtMs < args.intervalSeconds * 1000) {
    return {
      swept: false,
      nextLastAtMs: args.lastSweepAtMs,
      candidates: 0,
      refreshed: 0,
      failed: 0,
      results: [],
      windowSeconds: MARKET_VOLUME_24H_WINDOW_SECONDS,
    };
  }

  const outcome = await refreshStale24hMarketWindows(args.db, {
    chainId: args.chainId,
    nowSec: Math.floor(now / 1000),
    quoteUsdMaxAgeSeconds: args.quoteUsdMaxAgeSeconds,
    dustRaw: args.dustRaw,
  });

  return {
    swept: true,
    nextLastAtMs: now,
    candidates: outcome.candidates,
    refreshed: outcome.refreshed,
    failed: outcome.failed,
    results: outcome.results,
    windowSeconds: MARKET_VOLUME_24H_WINDOW_SECONDS,
  };
}
