/**
 * SCOOP support-wallet Pump buy persistence.
 * Idempotent on (chain_id, signature, event_index). Never lowercases Solana ids.
 */

import { SCOOP_SUPPORT_WALLET, isScoopSupportWallet } from '@scoop/shared';
import type { Queryable } from '../types.js';
import { PUMP_MARKET_CHAIN_ID } from './pump-trades.js';

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export type ScoopSupportBuyRow = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  signature: string;
  eventIndex: number;
  slot: number | bigint;
  blockTime: Date | string;
  supportWallet: string;
  solAmountLamports: string | number | bigint;
  solAmount: string;
  tokenAmountRaw: string;
  tokenAmount: string;
  tokenDecimals: number;
  source?: 'pump' | 'pumpportal' | 'alchemy' | 'backfill';
};

export type ScoopSupportBuyAggregate = {
  mint: string;
  scoopSupportBuyCount: number;
  /** Decimal SOL string, integer-safe from SUM(sol_amount). */
  scoopSupportTotalSol: string;
  scoopSupportLastBuySol: string | null;
  /** Unix seconds. */
  scoopSupportLastBuyAt: number | null;
  scoopSupportLastSignature: string | null;
};

export type ScoopSupportBuyHistoryItem = {
  signature: string;
  eventIndex: number;
  solAmount: string;
  solAmountLamports: string;
  tokenAmountRaw: string;
  blockTime: number;
};

export type UpsertScoopSupportBuyResult = {
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

function lamportsPositive(raw: string | number | bigint): boolean {
  try {
    return BigInt(String(raw)) > 0n;
  } catch {
    return false;
  }
}

function tokenRawPositive(raw: string): boolean {
  try {
    return BigInt(raw.trim()) > 0n;
  } catch {
    return false;
  }
}

/**
 * Qualifying support buy gate (shared by live ingest + backfill).
 * Does not check listed-mint — caller must ensure mint is SCOOP-listed Pump.
 */
export function isQualifyingScoopSupportBuy(args: {
  side: string;
  wallet: string | null | undefined;
  solAmountLamports: string | number | bigint;
  tokenAmountRaw: string;
}): boolean {
  if (args.side !== 'buy') return false;
  if (!isScoopSupportWallet(args.wallet)) return false;
  if (!lamportsPositive(args.solAmountLamports)) return false;
  if (!tokenRawPositive(args.tokenAmountRaw)) return false;
  return true;
}

export async function upsertScoopSupportBuy(
  db: Queryable,
  row: ScoopSupportBuyRow,
): Promise<UpsertScoopSupportBuyResult> {
  if (row.chainId !== PUMP_MARKET_CHAIN_ID) {
    throw new Error(`Invalid support-buy chain_id: ${row.chainId}`);
  }
  if (!isScoopSupportWallet(row.supportWallet)) {
    throw new Error('supportWallet must be the canonical SCOOP support wallet');
  }
  if (!lamportsPositive(row.solAmountLamports) || !tokenRawPositive(row.tokenAmountRaw)) {
    return { inserted: false };
  }
  if (!Number.isInteger(row.eventIndex) || row.eventIndex < 0) {
    throw new Error(`Invalid eventIndex: ${row.eventIndex}`);
  }
  if (!Number.isInteger(row.tokenDecimals) || row.tokenDecimals < 0) {
    throw new Error(`Invalid tokenDecimals: ${row.tokenDecimals}`);
  }

  const mint = assertMint(row.mint);
  const signature = assertSignature(row.signature);

  const result = await db.query(
    `INSERT INTO scoop_support_buys (
      chain_id, mint, signature, event_index, slot, block_time, support_wallet,
      sol_amount_lamports, sol_amount, token_amount_raw, token_amount, token_decimals,
      source
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
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
      SCOOP_SUPPORT_WALLET,
      String(row.solAmountLamports),
      row.solAmount,
      row.tokenAmountRaw,
      row.tokenAmount,
      row.tokenDecimals,
      row.source ?? 'alchemy',
    ],
  );

  return { inserted: (result.rowCount ?? 0) > 0 };
}

function mapAggregateRow(row: Record<string, unknown>): ScoopSupportBuyAggregate {
  const lastAt = row.last_buy_at;
  let scoopSupportLastBuyAt: number | null = null;
  if (lastAt instanceof Date) {
    scoopSupportLastBuyAt = Math.floor(lastAt.getTime() / 1000);
  } else if (lastAt != null) {
    const ms = new Date(String(lastAt)).getTime();
    if (Number.isFinite(ms)) scoopSupportLastBuyAt = Math.floor(ms / 1000);
  }

  return {
    mint: String(row.mint),
    scoopSupportBuyCount: Number(row.buy_count ?? 0),
    scoopSupportTotalSol: String(row.total_sol ?? '0'),
    scoopSupportLastBuySol:
      row.last_buy_sol == null ? null : String(row.last_buy_sol),
    scoopSupportLastBuyAt,
    scoopSupportLastSignature:
      row.last_signature == null ? null : String(row.last_signature),
  };
}

/** Batch aggregates for /markets overlay — one query, no N+1. */
export async function getScoopSupportBuyAggregates(
  db: Queryable,
  mints: readonly string[],
): Promise<Map<string, ScoopSupportBuyAggregate>> {
  const cleaned = [
    ...new Set(
      mints
        .map((m) => m.trim())
        .filter((m) => SOLANA_BASE58_RE.test(m) && !m.startsWith('0x')),
    ),
  ];
  const out = new Map<string, ScoopSupportBuyAggregate>();
  if (cleaned.length === 0) return out;

  const result = await db.query(
    `SELECT
       mint,
       COUNT(*)::int AS buy_count,
       COALESCE(SUM(sol_amount), 0)::text AS total_sol,
       (ARRAY_AGG(sol_amount ORDER BY block_time DESC, signature DESC, event_index DESC))[1]::text AS last_buy_sol,
       (ARRAY_AGG(block_time ORDER BY block_time DESC, signature DESC, event_index DESC))[1] AS last_buy_at,
       (ARRAY_AGG(signature ORDER BY block_time DESC, signature DESC, event_index DESC))[1] AS last_signature
     FROM scoop_support_buys
     WHERE chain_id = $1
       AND mint = ANY($2::text[])
     GROUP BY mint`,
    [PUMP_MARKET_CHAIN_ID, cleaned],
  );

  for (const row of result.rows as Record<string, unknown>[]) {
    const agg = mapAggregateRow(row);
    out.set(agg.mint, agg);
  }
  return out;
}

export async function getScoopSupportBuyAggregate(
  db: Queryable,
  mint: string,
): Promise<ScoopSupportBuyAggregate | null> {
  const map = await getScoopSupportBuyAggregates(db, [mint]);
  return map.get(mint.trim()) ?? null;
}

export async function listScoopSupportBuys(
  db: Queryable,
  mint: string,
  opts: { limit?: number } = {},
): Promise<ScoopSupportBuyHistoryItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const result = await db.query(
    `SELECT signature, event_index, sol_amount, sol_amount_lamports, token_amount_raw, block_time
     FROM scoop_support_buys
     WHERE chain_id = $1 AND mint = $2
     ORDER BY block_time DESC, signature DESC, event_index DESC
     LIMIT $3`,
    [PUMP_MARKET_CHAIN_ID, mint.trim(), limit],
  );

  return (result.rows as Record<string, unknown>[]).map((row) => {
    const bt = row.block_time;
    const blockTime =
      bt instanceof Date
        ? Math.floor(bt.getTime() / 1000)
        : Math.floor(new Date(String(bt)).getTime() / 1000);
    return {
      signature: String(row.signature),
      eventIndex: Number(row.event_index),
      solAmount: String(row.sol_amount),
      solAmountLamports: String(row.sol_amount_lamports),
      tokenAmountRaw: String(row.token_amount_raw),
      blockTime,
    };
  });
}

/**
 * Bounded backfill from existing pump_trades for the support wallet.
 * Only buys for SCOOP-listed Pump mints (launches ∩ tokens, market_source=pump).
 */
export async function backfillScoopSupportBuysFromPumpTrades(
  db: Queryable,
  opts: { limit?: number } = {},
): Promise<{ scanned: number; inserted: number; mints: string[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  const result = await db.query(
    `SELECT
       t.mint,
       t.signature,
       t.event_index,
       t.slot,
       t.block_time,
       t.wallet,
       t.sol_amount_lamports,
       t.sol_amount,
       t.token_amount_raw,
       t.token_amount,
       t.source,
       tok.decimals
     FROM pump_trades t
     INNER JOIN launches l
       ON l.chain_id = t.chain_id
      AND l.token_address = t.mint
      AND l.market_source = 'pump'
     INNER JOIN tokens tok
       ON tok.chain_id = t.chain_id
      AND tok.token_address = t.mint
     WHERE t.chain_id = $1
       AND t.side = 'buy'
       AND t.wallet = $2
       AND t.sol_amount_lamports > 0
       AND t.token_amount_raw > 0
     ORDER BY t.block_time ASC, t.signature ASC, t.event_index ASC
     LIMIT $3`,
    [PUMP_MARKET_CHAIN_ID, SCOOP_SUPPORT_WALLET, limit],
  );

  let inserted = 0;
  const mints = new Set<string>();
  for (const row of result.rows as Record<string, unknown>[]) {
    const mint = String(row.mint);
    const res = await upsertScoopSupportBuy(db, {
      chainId: PUMP_MARKET_CHAIN_ID,
      mint,
      signature: String(row.signature),
      eventIndex: Number(row.event_index),
      slot: BigInt(String(row.slot)),
      blockTime: row.block_time as Date | string,
      supportWallet: SCOOP_SUPPORT_WALLET,
      solAmountLamports: String(row.sol_amount_lamports),
      solAmount: String(row.sol_amount),
      tokenAmountRaw: String(row.token_amount_raw),
      tokenAmount: String(row.token_amount),
      tokenDecimals: Number(row.decimals),
      source: 'backfill',
    });
    if (res.inserted) {
      inserted += 1;
      mints.add(mint);
    }
  }

  return {
    scanned: result.rows.length,
    inserted,
    mints: [...mints],
  };
}
