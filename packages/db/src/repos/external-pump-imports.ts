/**
 * Registry for external Pump imports (canary / future official).
 * Cleanup must prove the mint was registered here before deleting market rows.
 */

import type { Queryable } from '../types.js';
import { PUMP_MARKET_CHAIN_ID } from './pump-trades.js';

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type ExternalPumpImportKind = 'canary' | 'official';

export type ExternalPumpImportCanaryRow = {
  chainId: typeof PUMP_MARKET_CHAIN_ID;
  mint: string;
  importKind: ExternalPumpImportKind;
  launchSignature: string;
  importedAt: Date;
  notes: string | null;
};

function assertMint(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_BASE58_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana mint: ${raw}`);
  }
  return t;
}

export async function registerExternalPumpImport(
  db: Queryable,
  input: {
    mint: string;
    launchSignature: string;
    importKind?: ExternalPumpImportKind;
    notes?: string | null;
  },
): Promise<void> {
  const mint = assertMint(input.mint);
  const signature = input.launchSignature.trim();
  if (!signature) throw new Error('launchSignature required');
  await db.query(
    `INSERT INTO external_pump_import_canaries (
       chain_id, mint, import_kind, launch_signature, notes
     ) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (chain_id, mint) DO UPDATE SET
       import_kind = EXCLUDED.import_kind,
       launch_signature = EXCLUDED.launch_signature,
       notes = EXCLUDED.notes,
       imported_at = NOW()`,
    [
      PUMP_MARKET_CHAIN_ID,
      mint,
      input.importKind ?? 'canary',
      signature,
      input.notes ?? null,
    ],
  );
}

export async function getExternalPumpImport(
  db: Queryable,
  mint: string,
): Promise<ExternalPumpImportCanaryRow | null> {
  const result = await db.query(
    `SELECT chain_id, mint, import_kind, launch_signature, imported_at, notes
     FROM external_pump_import_canaries
     WHERE chain_id = $1 AND mint = $2
     LIMIT 1`,
    [PUMP_MARKET_CHAIN_ID, assertMint(mint)],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    chainId: PUMP_MARKET_CHAIN_ID,
    mint: String(row.mint),
    importKind: row.import_kind as ExternalPumpImportKind,
    launchSignature: String(row.launch_signature),
    importedAt:
      row.imported_at instanceof Date
        ? row.imported_at
        : new Date(String(row.imported_at)),
    notes: row.notes == null ? null : String(row.notes),
  };
}

export type ExternalPumpCanaryFootprint = {
  mint: string;
  registry: ExternalPumpImportCanaryRow | null;
  token: boolean;
  launch: boolean;
  pumpMarketState: boolean;
  pumpTrades: number;
  pumpCandles: number;
  pumpCheckpoints: boolean;
  scoopSupportBuys: number;
  displayImageUrl: string | null;
  imageUri: string | null;
};

export async function collectExternalPumpCanaryFootprint(
  db: Queryable,
  mint: string,
): Promise<ExternalPumpCanaryFootprint> {
  const m = assertMint(mint);
  const registry = await getExternalPumpImport(db, m);

  const token = await db.query(
    `SELECT image_uri, display_image_url FROM tokens
     WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  const launch = await db.query(
    `SELECT 1 FROM launches
     WHERE chain_id = $1 AND token_address = $2 AND market_source = 'pump' LIMIT 1`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  const state = await db.query(
    `SELECT 1 FROM pump_market_state WHERE chain_id = $1 AND mint = $2 LIMIT 1`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  const trades = await db.query(
    `SELECT COUNT(*)::int AS n FROM pump_trades WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  const candles = await db.query(
    `SELECT COUNT(*)::int AS n FROM pump_candles WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  const checkpoints = await db.query(
    `SELECT 1 FROM pump_worker_checkpoints WHERE chain_id = $1 AND mint = $2 LIMIT 1`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  let scoopSupportBuys = 0;
  try {
    const support = await db.query(
      `SELECT COUNT(*)::int AS n FROM scoop_support_buys WHERE chain_id = $1 AND mint = $2`,
      [PUMP_MARKET_CHAIN_ID, m],
    );
    scoopSupportBuys = Number((support.rows[0] as { n: number } | undefined)?.n ?? 0);
  } catch {
    scoopSupportBuys = 0;
  }

  const tokenRow = token.rows[0] as
    | { image_uri: string | null; display_image_url: string | null }
    | undefined;

  return {
    mint: m,
    registry,
    token: token.rows.length > 0,
    launch: launch.rows.length > 0,
    pumpMarketState: state.rows.length > 0,
    pumpTrades: Number((trades.rows[0] as { n: number } | undefined)?.n ?? 0),
    pumpCandles: Number((candles.rows[0] as { n: number } | undefined)?.n ?? 0),
    pumpCheckpoints: checkpoints.rows.length > 0,
    scoopSupportBuys,
    displayImageUrl: tokenRow?.display_image_url ?? null,
    imageUri: tokenRow?.image_uri ?? null,
  };
}

/**
 * Mint-scoped canary cleanup. Caller must prove registry.importKind === 'canary'.
 * Returns per-table delete counts.
 */
export async function deleteExternalPumpCanaryMarket(
  db: Queryable,
  mint: string,
): Promise<Record<string, number>> {
  const m = assertMint(mint);
  const counts: Record<string, number> = {};

  const del = async (label: string, sql: string, params: unknown[]) => {
    const result = await db.query(sql, params);
    counts[label] = result.rowCount ?? 0;
  };

  // Drop watchlist source BEFORE pump_* so a concurrent worker refresh cannot
  // re-subscribe from launches while we are mid-scrub (still race until in-memory refresh).
  await del(
    'launches',
    `DELETE FROM launches WHERE chain_id = $1 AND token_address = $2 AND market_source = 'pump'`,
    [PUMP_MARKET_CHAIN_ID, m],
  );

  const supportTable = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'scoop_support_buys'
     LIMIT 1`,
  );
  if (supportTable.rows.length > 0) {
    await del(
      'scoop_support_buys',
      `DELETE FROM scoop_support_buys WHERE chain_id = $1 AND mint = $2`,
      [PUMP_MARKET_CHAIN_ID, m],
    );
  } else {
    counts.scoop_support_buys = 0;
  }
  await del(
    'pump_candles',
    `DELETE FROM pump_candles WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_trades',
    `DELETE FROM pump_trades WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_market_state',
    `DELETE FROM pump_market_state WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_worker_checkpoints',
    `DELETE FROM pump_worker_checkpoints WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'tokens',
    `DELETE FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'external_pump_import_canaries',
    `DELETE FROM external_pump_import_canaries WHERE chain_id = $1 AND mint = $2 AND import_kind = 'canary'`,
    [PUMP_MARKET_CHAIN_ID, m],
  );

  return counts;
}

/**
 * Phase-1 detach: remove Pump launch row so DB watchlist drops the mint.
 * Does not touch pump_* / tokens / registry — allows worker refresh before scrub.
 */
export async function detachExternalPumpCanaryWatchlist(
  db: Queryable,
  mint: string,
): Promise<number> {
  const m = assertMint(mint);
  const result = await db.query(
    `DELETE FROM launches
     WHERE chain_id = $1 AND token_address = $2 AND market_source = 'pump'`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  return result.rowCount ?? 0;
}

/**
 * Mint-scoped orphan scrub for pump_* (+ support) after watchlist detach.
 * Does not delete tokens / launches / registry.
 */
export async function scrubExternalPumpCanaryMarketData(
  db: Queryable,
  mint: string,
): Promise<Record<string, number>> {
  const m = assertMint(mint);
  const counts: Record<string, number> = {};
  const del = async (label: string, sql: string, params: unknown[]) => {
    const result = await db.query(sql, params);
    counts[label] = result.rowCount ?? 0;
  };

  const supportTable = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'scoop_support_buys'
     LIMIT 1`,
  );
  if (supportTable.rows.length > 0) {
    await del(
      'scoop_support_buys',
      `DELETE FROM scoop_support_buys WHERE chain_id = $1 AND mint = $2`,
      [PUMP_MARKET_CHAIN_ID, m],
    );
  } else {
    counts.scoop_support_buys = 0;
  }
  await del(
    'pump_candles',
    `DELETE FROM pump_candles WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_trades',
    `DELETE FROM pump_trades WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_market_state',
    `DELETE FROM pump_market_state WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  await del(
    'pump_worker_checkpoints',
    `DELETE FROM pump_worker_checkpoints WHERE chain_id = $1 AND mint = $2`,
    [PUMP_MARKET_CHAIN_ID, m],
  );
  return counts;
}
