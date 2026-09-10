import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface HolderRewardDepositRow {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  feeDistributorAddress?: string | null;
  assetAddress: string;
  amountRaw: string | bigint;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
}

export async function upsertHolderRewardDeposit(
  db: Queryable,
  row: HolderRewardDepositRow,
): Promise<void> {
  await db.query(
    `INSERT INTO holder_reward_deposits (
      chain_id, vault_address, token_address, fee_distributor_address, asset_address,
      amount_raw, tx_hash, log_index, block_number, block_hash, block_timestamp
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      vault_address = EXCLUDED.vault_address,
      token_address = EXCLUDED.token_address,
      fee_distributor_address = EXCLUDED.fee_distributor_address,
      asset_address = EXCLUDED.asset_address,
      amount_raw = EXCLUDED.amount_raw,
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp`,
    [
      row.chainId,
      normalizeAddress(row.vaultAddress),
      normalizeAddress(row.tokenAddress),
      row.feeDistributorAddress == null
        ? null
        : normalizeAddress(row.feeDistributorAddress),
      normalizeAddress(row.assetAddress),
      toNumericString(row.amountRaw),
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
    ],
  );
}

export interface HolderRewardRoundRow {
  chainId: number;
  vaultAddress: string;
  roundId: number | bigint;
  assetAddress: string;
  merkleRoot: string;
  totalCommittedRaw: string | bigint;
  publishedTxHash: string;
  publishedBlockNumber: number | bigint;
  publishedLogIndex: number;
  publishedAt: number | bigint;
  status?: string;
}

/**
 * Publish a round. Merkle root is immutable: conflicting root on replay throws
 * via a guarded update (same root → no-op; different root → error).
 */
export async function upsertHolderRewardRound(
  db: Queryable,
  row: HolderRewardRoundRow,
): Promise<void> {
  const vault = normalizeAddress(row.vaultAddress);
  const asset = normalizeAddress(row.assetAddress);
  const root = normalizeBytes32(row.merkleRoot);
  const committed = toNumericString(row.totalCommittedRaw);

  const existing = await db.query<{ merkle_root: string }>(
    `SELECT merkle_root FROM holder_reward_rounds
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3 AND asset_address = $4`,
    [row.chainId, vault, toNumericString(row.roundId), asset],
  );
  if (existing.rows[0]) {
    if (normalizeBytes32(existing.rows[0].merkle_root) !== root) {
      throw new Error(
        `holder_reward_rounds root immutable conflict: vault=${vault} round=${row.roundId} asset=${asset}`,
      );
    }
    return;
  }

  await db.query(
    `INSERT INTO holder_reward_rounds (
      chain_id, vault_address, round_id, asset_address, merkle_root,
      total_committed_raw, total_paid_raw, remaining_raw,
      published_tx_hash, published_block_number, published_log_index, published_at, status
    ) VALUES (
      $1,$2,$3,$4,$5,$6,0,$6,$7,$8,$9,$10,$11
    )
    ON CONFLICT (chain_id, vault_address, round_id, asset_address) DO NOTHING`,
    [
      row.chainId,
      vault,
      toNumericString(row.roundId),
      asset,
      root,
      committed,
      normalizeBytes32(row.publishedTxHash),
      toNumericString(row.publishedBlockNumber),
      row.publishedLogIndex,
      toNumericString(row.publishedAt),
      row.status ?? 'published',
    ],
  );
}

export type HolderRewardPayoutType = 'push' | 'claim';
export type HolderRewardPayoutStatus = 'paid' | 'failed';

export interface HolderRewardPayoutRow {
  chainId: number;
  vaultAddress: string;
  roundId: number | bigint;
  assetAddress: string;
  accountAddress: string;
  amountRaw: string | bigint;
  payoutType: HolderRewardPayoutType;
  status: HolderRewardPayoutStatus;
  failureReason?: string | null;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
}

/**
 * Insert payout event and recompute round paid totals from paid payouts only.
 * Failed pushes never increment paid. Replay of the same event is a no-op.
 */
export async function upsertHolderRewardPayout(
  db: Queryable,
  row: HolderRewardPayoutRow,
): Promise<{ inserted: boolean }> {
  const vault = normalizeAddress(row.vaultAddress);
  const asset = normalizeAddress(row.assetAddress);
  const account = normalizeAddress(row.accountAddress);
  const txHash = normalizeBytes32(row.txHash);

  const existing = await db.query<{ tx_hash: string }>(
    `SELECT tx_hash FROM holder_reward_payouts
     WHERE chain_id = $1 AND tx_hash = $2 AND log_index = $3`,
    [row.chainId, txHash, row.logIndex],
  );
  if (existing.rows[0]) {
    return { inserted: false };
  }

  await db.query(
    `INSERT INTO holder_reward_payouts (
      chain_id, vault_address, round_id, asset_address, account_address,
      amount_raw, payout_type, status, failure_reason,
      tx_hash, log_index, block_number, block_hash, block_timestamp
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      row.chainId,
      vault,
      toNumericString(row.roundId),
      asset,
      account,
      toNumericString(row.amountRaw),
      row.payoutType,
      row.status,
      row.status === 'failed' ? (row.failureReason ?? null) : null,
      txHash,
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
    ],
  );

  await recomputeHolderRewardRoundTotals(db, {
    chainId: row.chainId,
    vaultAddress: vault,
    roundId: row.roundId,
    assetAddress: asset,
  });

  return { inserted: true };
}

/** Recompute paid/remaining/counters from payout events (replay-safe). */
export async function recomputeHolderRewardRoundTotals(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number | bigint;
    assetAddress: string;
  },
): Promise<void> {
  const vault = normalizeAddress(args.vaultAddress);
  const asset = normalizeAddress(args.assetAddress);
  await db.query(
    `UPDATE holder_reward_rounds r SET
      total_paid_raw = COALESCE(s.paid_raw, 0),
      remaining_raw = r.total_committed_raw - COALESCE(s.paid_raw, 0),
      push_success_count = COALESCE(s.push_ok, 0),
      push_failure_count = COALESCE(s.push_fail, 0),
      claim_count = COALESCE(s.claims, 0),
      status = CASE
        WHEN COALESCE(s.paid_raw, 0) >= r.total_committed_raw AND r.total_committed_raw > 0
          THEN 'settled'
        WHEN COALESCE(s.paid_raw, 0) > 0 THEN 'settling'
        ELSE r.status
      END,
      updated_at = NOW()
     FROM (
       SELECT
         COALESCE(SUM(amount_raw) FILTER (WHERE status = 'paid'), 0) AS paid_raw,
         COUNT(*) FILTER (WHERE payout_type = 'push' AND status = 'paid')::int AS push_ok,
         COUNT(*) FILTER (WHERE payout_type = 'push' AND status = 'failed')::int AS push_fail,
         COUNT(*) FILTER (WHERE payout_type = 'claim' AND status = 'paid')::int AS claims
       FROM holder_reward_payouts
       WHERE chain_id = $1
         AND vault_address = $2
         AND round_id = $3
         AND asset_address = $4
     ) s
     WHERE r.chain_id = $1
       AND r.vault_address = $2
       AND r.round_id = $3
       AND r.asset_address = $4`,
    [args.chainId, vault, toNumericString(args.roundId), asset],
  );
}

export interface PositiveHolderBalanceRow {
  holderAddress: string;
  balanceRaw: string;
  isSystemAddress: boolean;
  holderClass: string;
  lastUpdatedBlock: string;
}

/** Latest positive balances for a token (not historical block snapshots). */
export async function listPositiveHolderBalances(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
  opts?: { retailOnly?: boolean; limit?: number },
): Promise<PositiveHolderBalanceRow[]> {
  const retailOnly = opts?.retailOnly ?? false;
  const limit = opts?.limit ?? 100_000;
  const result = await db.query<{
    holder_address: string;
    balance_raw: string;
    is_system_address: boolean;
    holder_class: string;
    last_updated_block: string;
  }>(
    `SELECT holder_address, balance_raw::text AS balance_raw,
            is_system_address, holder_class, last_updated_block::text AS last_updated_block
     FROM holder_balances
     WHERE chain_id = $1
       AND token_address = $2
       AND balance_raw > 0
       AND ($3::boolean = FALSE OR is_system_address = FALSE)
     ORDER BY balance_raw DESC, holder_address ASC
     LIMIT $4`,
    [chainId, normalizeAddress(tokenAddress), retailOnly, limit],
  );
  return result.rows.map((row) => ({
    holderAddress: normalizeAddress(row.holder_address),
    balanceRaw: String(row.balance_raw),
    isSystemAddress: Boolean(row.is_system_address),
    holderClass: String(row.holder_class),
    lastUpdatedBlock: String(row.last_updated_block),
  }));
}
