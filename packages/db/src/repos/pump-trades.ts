/**
 * Pump trade persistence — Solana signature + event_index identity.
 * No EVM normalizeAddress / log_index.
 */

import type { Queryable } from '../types.js';

export const PUMP_MARKET_CHAIN_ID = 900001 as const;

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export type PumpTradeSide = 'buy' | 'sell';

export type PumpTradeRow = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  signature: string;
  eventIndex: number;
  slot: number | bigint;
  blockTime: Date | string;
  side: PumpTradeSide;
  wallet?: string | null;
  tokenAmountRaw: string;
  tokenAmount: string;
  solAmountLamports: string | number | bigint;
  solAmount: string;
  priceSol: string;
  source?: 'pump' | 'pumpportal';
  curveAddress?: string | null;
};

export type UpsertPumpTradeResult = {
  inserted: boolean;
};

function assertMint(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_BASE58_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana mint: ${raw}`);
  }
  return t;
}

function assertSignature(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_SIG_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana signature: ${raw}`);
  }
  return t;
}

function assertSide(side: string): PumpTradeSide {
  if (side !== 'buy' && side !== 'sell') {
    throw new Error(`Invalid Pump trade side: ${side}`);
  }
  return side;
}

/**
 * Insert trade. Returns inserted=false on duplicate (idempotent).
 * Does not update market state / candles — caller orchestrates.
 */
export async function upsertPumpTrade(
  db: Queryable,
  row: PumpTradeRow,
): Promise<UpsertPumpTradeResult> {
  if (row.chainId !== PUMP_MARKET_CHAIN_ID) {
    throw new Error(`Invalid Pump chain_id: ${row.chainId}`);
  }
  const mint = assertMint(row.mint);
  const signature = assertSignature(row.signature);
  const side = assertSide(row.side);
  if (!Number.isInteger(row.eventIndex) || row.eventIndex < 0) {
    throw new Error(`Invalid eventIndex: ${row.eventIndex}`);
  }

  const result = await db.query(
    `INSERT INTO pump_trades (
      chain_id, mint, signature, event_index, slot, block_time, side, wallet,
      token_amount_raw, token_amount, sol_amount_lamports, sol_amount, price_sol,
      source, curve_address
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
    )
    ON CONFLICT (chain_id, signature, event_index) DO NOTHING
    RETURNING signature`,
    [
      PUMP_MARKET_CHAIN_ID,
      mint,
      signature,
      row.eventIndex,
      String(row.slot),
      row.blockTime instanceof Date ? row.blockTime.toISOString() : row.blockTime,
      side,
      row.wallet?.trim() || null,
      row.tokenAmountRaw,
      row.tokenAmount,
      String(row.solAmountLamports),
      row.solAmount,
      row.priceSol,
      row.source ?? 'pump',
      row.curveAddress?.trim() || null,
    ],
  );

  return { inserted: (result.rowCount ?? 0) > 0 };
}
