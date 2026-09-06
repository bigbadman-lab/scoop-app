import type { Queryable } from '../types.js';
import { normalizeAddress, toNumericString } from '../hex.js';

export interface HolderBalanceRow {
  chainId: number;
  tokenAddress: string;
  holderAddress: string;
  balanceRaw: string | bigint;
  holderClass?: string;
  isSystemAddress?: boolean;
  firstSeenBlock: number | bigint;
  lastUpdatedBlock: number | bigint;
}

export async function upsertHolderBalance(db: Queryable, row: HolderBalanceRow): Promise<void> {
  await db.query(
    `INSERT INTO holder_balances (
      chain_id, token_address, holder_address, balance_raw, holder_class,
      is_system_address, first_seen_block, last_updated_block
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (chain_id, token_address, holder_address) DO UPDATE SET
      balance_raw = EXCLUDED.balance_raw,
      holder_class = EXCLUDED.holder_class,
      is_system_address = EXCLUDED.is_system_address,
      last_updated_block = EXCLUDED.last_updated_block,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      normalizeAddress(row.holderAddress),
      toNumericString(row.balanceRaw),
      row.holderClass ?? 'user',
      row.isSystemAddress ?? false,
      toNumericString(row.firstSeenBlock),
      toNumericString(row.lastUpdatedBlock),
    ],
  );
}

export async function deleteHolderBalance(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
  holderAddress: string,
): Promise<void> {
  await db.query(
    `DELETE FROM holder_balances
     WHERE chain_id = $1 AND token_address = $2 AND holder_address = $3`,
    [chainId, normalizeAddress(tokenAddress), normalizeAddress(holderAddress)],
  );
}
