/**
 * SCOOP Pump launch watchlist — only chain_id=900001 + market_source='pump'.
 * No EVM address normalization. No global Pump discovery.
 */

import type { Queryable } from '../types.js';

export const PUMP_WATCHLIST_CHAIN_ID = 900001 as const;

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type PumpWatchlistItem = {
  chainId: typeof PUMP_WATCHLIST_CHAIN_ID;
  mint: string;
  signature: string;
  creator: string;
  launchedAt: number | null;
  name: string;
  symbol: string;
  imageUri: string;
  totalSupplyRaw: string;
  decimals: number;
};

function normalizeMint(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_BASE58_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana mint: ${raw}`);
  }
  return t;
}

const WATCHLIST_SELECT = `
  SELECT
    l.token_address AS mint,
    l.launch_tx_hash AS signature,
    l.deployer_address AS creator,
    l.launched_at,
    t.name,
    t.symbol,
    t.image_uri,
    t.total_supply_raw,
    t.decimals
  FROM launches l
  INNER JOIN tokens t
    ON t.chain_id = l.chain_id
   AND t.token_address = l.token_address
  WHERE l.chain_id = $1
    AND l.market_source = 'pump'
`;

function mapRow(row: Record<string, unknown>): PumpWatchlistItem {
  return {
    chainId: PUMP_WATCHLIST_CHAIN_ID,
    mint: String(row.mint),
    signature: String(row.signature),
    creator: String(row.creator),
    launchedAt:
      row.launched_at == null || row.launched_at === ''
        ? null
        : Number(row.launched_at),
    name: String(row.name ?? ''),
    symbol: String(row.symbol ?? ''),
    imageUri: String(row.image_uri ?? ''),
    totalSupplyRaw: String(row.total_supply_raw ?? '0'),
    decimals: Number(row.decimals ?? 6),
  };
}

/** Full Pump watchlist for the Solana market-data worker. */
export async function listPumpWatchlist(
  db: Queryable,
): Promise<PumpWatchlistItem[]> {
  const result = await db.query(WATCHLIST_SELECT, [PUMP_WATCHLIST_CHAIN_ID]);
  return (result.rows as Record<string, unknown>[]).map(mapRow);
}

/** Lookup a single SCOOP Pump mint. Returns null if not a Pump launch. */
export async function getPumpWatchlistItem(
  db: Queryable,
  mintInput: string,
): Promise<PumpWatchlistItem | null> {
  const mint = normalizeMint(mintInput);
  const result = await db.query(
    `${WATCHLIST_SELECT} AND l.token_address = $2 LIMIT 1`,
    [PUMP_WATCHLIST_CHAIN_ID, mint],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
