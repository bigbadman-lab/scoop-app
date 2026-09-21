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
  /** Unique owners with aggregate raw balance > 0. Null until first successful refresh. */
  holderCount: number | null;
  holdersUpdatedAt: Date | null;
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
    holderCount:
      row.holder_count == null || row.holder_count === ''
        ? null
        : Number(row.holder_count),
    holdersUpdatedAt:
      row.holders_updated_at == null
        ? null
        : new Date(String(row.holders_updated_at)),
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

/** Batch read pump_market_state for discovery / markets overlay. */
export async function getPumpMarketStates(
  db: Queryable,
  mints: readonly string[],
): Promise<Map<string, PumpMarketStateRow>> {
  const unique = [...new Set(mints.map((m) => m.trim()).filter(Boolean))];
  const out = new Map<string, PumpMarketStateRow>();
  if (unique.length === 0) return out;
  const result = await db.query(
    `SELECT * FROM pump_market_state
     WHERE chain_id = $1 AND mint = ANY($2::text[])`,
    [PUMP_MARKET_CHAIN_ID, unique],
  );
  for (const raw of result.rows as Record<string, unknown>[]) {
    const row = mapState(raw);
    out.set(row.mint, row);
  }
  return out;
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

/**
 * Persist Solana holder count only. Never touches price/FDV/volume/trades.
 * Failed fetches must not call this (avoids writing fake zero).
 */
export async function updatePumpHolderCount(
  db: Queryable,
  input: {
    mint: string;
    holderCount: number;
    holdersUpdatedAt?: Date | string;
  },
): Promise<PumpMarketStateRow> {
  const mint = input.mint.trim();
  if (!mint) throw new Error('mint is required');
  if (
    !Number.isInteger(input.holderCount) ||
    input.holderCount < 0 ||
    !Number.isSafeInteger(input.holderCount)
  ) {
    throw new Error(`Invalid holderCount: ${input.holderCount}`);
  }
  const holdersUpdatedAt =
    input.holdersUpdatedAt instanceof Date
      ? input.holdersUpdatedAt.toISOString()
      : (input.holdersUpdatedAt ?? new Date().toISOString());

  await db.query(
    `INSERT INTO pump_market_state (
       chain_id, mint, holder_count, holders_updated_at, updated_at
     ) VALUES (
       $1, $2, $3::bigint, $4::timestamptz, NOW()
     )
     ON CONFLICT (chain_id, mint) DO UPDATE SET
       holder_count = EXCLUDED.holder_count,
       holders_updated_at = EXCLUDED.holders_updated_at,
       updated_at = NOW()`,
    [PUMP_MARKET_CHAIN_ID, mint, input.holderCount, holdersUpdatedAt],
  );

  const state = await getPumpMarketState(db, mint);
  if (!state) {
    throw new Error(`Failed to update pump holder_count for ${mint}`);
  }
  return state;
}
