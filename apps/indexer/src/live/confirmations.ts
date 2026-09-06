import type { Queryable } from '@scoop/db';

export type ConfirmationStatus = 'pending' | 'confirmed' | 'finalized';

export interface ConfirmationHeads {
  latest: bigint;
  safe: bigint;
  finalized: bigint;
}

/**
 * Derive confirmation status for a block relative to heads.
 * pending > safe; confirmed <= safe; finalized <= finalized head.
 */
export function confirmationStatusForBlock(
  blockNumber: bigint,
  heads: ConfirmationHeads,
): ConfirmationStatus {
  if (blockNumber <= heads.finalized) return 'finalized';
  if (blockNumber <= heads.safe) return 'confirmed';
  return 'pending';
}

/** Rank for monotonic promotion only (never demote). */
export function confirmationRank(status: ConfirmationStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'confirmed':
      return 1;
    case 'finalized':
      return 2;
  }
}

export function shouldPromote(
  current: ConfirmationStatus | string | null | undefined,
  next: ConfirmationStatus,
): boolean {
  const cur = (current as ConfirmationStatus) ?? 'pending';
  return confirmationRank(next) > confirmationRank(cur);
}

/**
 * Promote confirmation_status on raw_chain_events and trades (UPDATE, no duplicates).
 */
export async function promoteConfirmations(
  db: Queryable,
  args: {
    chainId: number;
    heads: ConfirmationHeads;
  },
): Promise<{ rawUpdated: number; tradesUpdated: number }> {
  const { chainId, heads } = args;

  const promoteTable = async (table: 'raw_chain_events' | 'trades', toStatus: ConfirmationStatus, maxBlock: bigint) => {
    const fromStatuses =
      toStatus === 'confirmed'
        ? ['pending']
        : toStatus === 'finalized'
          ? ['pending', 'confirmed']
          : [];
    if (fromStatuses.length === 0) return 0;
    const result = await db.query(
      `UPDATE ${table}
       SET confirmation_status = $3
       WHERE chain_id = $1
         AND block_number <= $2
         AND confirmation_status = ANY($4::text[])`,
      [chainId, maxBlock.toString(), toStatus, fromStatuses],
    );
    return result.rowCount ?? 0;
  };

  // Note: trades table may not have confirmation_status in 6A.5 — update raw only if column missing.
  // Prefer raw_chain_events which has confirmation_status.
  let rawUpdated = 0;
  rawUpdated += await promoteTable('raw_chain_events', 'confirmed', heads.safe);
  rawUpdated += await promoteTable('raw_chain_events', 'finalized', heads.finalized);

  // trades may lack confirmation_status in 6A.5 — SAVEPOINT so a failed UPDATE
  // does not abort the outer transaction (plain try/catch is not enough in Postgres).
  let tradesUpdated = 0;
  await db.query('SAVEPOINT promote_trades');
  try {
    tradesUpdated += await promoteTable('trades', 'confirmed', heads.safe);
    tradesUpdated += await promoteTable('trades', 'finalized', heads.finalized);
    await db.query('RELEASE SAVEPOINT promote_trades');
  } catch {
    await db.query('ROLLBACK TO SAVEPOINT promote_trades');
    tradesUpdated = 0;
  }

  return { rawUpdated, tradesUpdated };
}
