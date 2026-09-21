/**
 * Pump market state + 24h rolling stats from pump_trades.
 */

import type { Queryable } from '../types.js';
import { PUMP_MARKET_CHAIN_ID } from './pump-trades.js';

export type PumpMarketStateRow = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  priceSol: string | null;
  fdvSol: string | null;
  volume24hSol: string;
  tradeCount24h: number;
  buyCount24h: number;
  sellCount24h: number;
  lastTradeSignature: string | null;
  lastTradeSlot: string | null;
  lastTradeAt: Date | null;
  lastEventCursor: string | null;
  updatedAt: Date | null;
};

export type RefreshPumpMarketStateInput = {
  mint: string;
  priceSol: string;
  fdvSol: string | null;
  lastTradeSignature: string;
  lastTradeSlot: number | bigint;
  lastTradeAt: Date | string;
  lastEventCursor?: string | null;
};

function mapState(row: Record<string, unknown>): PumpMarketStateRow {
  return {
    chainId: PUMP_MARKET_CHAIN_ID,
    mint: String(row.mint),
    priceSol: row.price_sol == null ? null : String(row.price_sol),
    fdvSol: row.fdv_sol == null ? null : String(row.fdv_sol),
    volume24hSol: String(row.volume_24h_sol ?? '0'),
    tradeCount24h: Number(row.trade_count_24h ?? 0),
    buyCount24h: Number(row.buy_count_24h ?? 0),
    sellCount24h: Number(row.sell_count_24h ?? 0),
    lastTradeSignature:
      row.last_trade_signature == null ? null : String(row.last_trade_signature),
    lastTradeSlot: row.last_trade_slot == null ? null : String(row.last_trade_slot),
    lastTradeAt: row.last_trade_at == null ? null : new Date(String(row.last_trade_at)),
    lastEventCursor:
      row.last_event_cursor == null ? null : String(row.last_event_cursor),
    updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)),
  };
}

export async function getPumpMarketState(
  db: Queryable,
  mint: string,
): Promise<PumpMarketStateRow | null> {
  const result = await db.query(
    `SELECT * FROM pump_market_state WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, mint.trim()],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapState(row) : null;
}

/**
 * Recompute 24h aggregates from indexed trades and upsert tip fields.
 */
export async function refreshPumpMarketStateFromTrades(
  db: Queryable,
  input: RefreshPumpMarketStateInput,
): Promise<PumpMarketStateRow> {
  const mint = input.mint.trim();
  const lastTradeAt =
    input.lastTradeAt instanceof Date
      ? input.lastTradeAt.toISOString()
      : input.lastTradeAt;

  await db.query(
    `INSERT INTO pump_market_state (
      chain_id, mint, price_sol, fdv_sol,
      volume_24h_sol, trade_count_24h, buy_count_24h, sell_count_24h,
      last_trade_signature, last_trade_slot, last_trade_at, last_event_cursor, updated_at
    )
    SELECT
      $1 AS chain_id,
      $2 AS mint,
      $3::numeric AS price_sol,
      $4::numeric AS fdv_sol,
      COALESCE(agg.volume_24h_sol, 0),
      COALESCE(agg.trade_count_24h, 0)::int,
      COALESCE(agg.buy_count_24h, 0)::int,
      COALESCE(agg.sell_count_24h, 0)::int,
      $5 AS last_trade_signature,
      $6::bigint AS last_trade_slot,
      $7::timestamptz AS last_trade_at,
      $8 AS last_event_cursor,
      NOW() AS updated_at
    FROM (
      SELECT
        SUM(sol_amount) AS volume_24h_sol,
        COUNT(*)::int AS trade_count_24h,
        COUNT(*) FILTER (WHERE side = 'buy')::int AS buy_count_24h,
        COUNT(*) FILTER (WHERE side = 'sell')::int AS sell_count_24h
      FROM pump_trades
      WHERE chain_id = $1
        AND mint = $2
        AND block_time >= NOW() - INTERVAL '24 hours'
    ) agg
    ON CONFLICT (chain_id, mint) DO UPDATE SET
      price_sol = EXCLUDED.price_sol,
      fdv_sol = EXCLUDED.fdv_sol,
      volume_24h_sol = EXCLUDED.volume_24h_sol,
      trade_count_24h = EXCLUDED.trade_count_24h,
      buy_count_24h = EXCLUDED.buy_count_24h,
      sell_count_24h = EXCLUDED.sell_count_24h,
      last_trade_signature = EXCLUDED.last_trade_signature,
      last_trade_slot = EXCLUDED.last_trade_slot,
      last_trade_at = EXCLUDED.last_trade_at,
      last_event_cursor = COALESCE(EXCLUDED.last_event_cursor, pump_market_state.last_event_cursor),
      updated_at = NOW()`,
    [
      PUMP_MARKET_CHAIN_ID,
      mint,
      input.priceSol,
      input.fdvSol,
      input.lastTradeSignature,
      String(input.lastTradeSlot),
      lastTradeAt,
      input.lastEventCursor ?? null,
    ],
  );

  const state = await getPumpMarketState(db, mint);
  if (!state) {
    throw new Error(`Failed to refresh pump_market_state for ${mint}`);
  }
  return state;
}
