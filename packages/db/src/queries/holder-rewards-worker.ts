import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export type HolderRewardsVaultMarket = {
  chainId: number;
  tokenAddress: string;
  quoteAsset: string;
  holderRewards: string;
  feeDistributor: string;
  liquidityLocker: string;
  additionalFee: number;
  totalPoolFee: number;
  creatorAllocationDestination: number;
  additionalFeeDestination: number;
};

/** Launches that can route fees to holders (P5 columns required). */
export async function listHolderRewardVaultMarkets(
  db: Queryable,
  chainId: number,
): Promise<HolderRewardsVaultMarket[]> {
  const result = await db.query<{
    chain_id: number;
    token_address: string;
    quote_asset: string;
    holder_rewards_address: string;
    fee_distributor_address: string;
    liquidity_locker_address: string;
    additional_fee: number;
    total_pool_fee: number;
    creator_allocation_destination: number;
    additional_fee_destination: number;
  }>(
    `SELECT
       chain_id,
       token_address,
       quote_asset,
       holder_rewards_address,
       fee_distributor_address,
       liquidity_locker_address,
       additional_fee,
       total_pool_fee,
       creator_allocation_destination,
       additional_fee_destination
     FROM launches
     WHERE chain_id = $1
       AND holder_rewards_address IS NOT NULL
       AND holder_rewards_address <> '0x0000000000000000000000000000000000000000'
       AND (
         creator_allocation_destination = 1
         OR (additional_fee > 0 AND additional_fee_destination = 2)
       )
     ORDER BY launched_at ASC`,
    [chainId],
  );
  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    quoteAsset: normalizeAddress(row.quote_asset),
    holderRewards: normalizeAddress(row.holder_rewards_address),
    feeDistributor: normalizeAddress(row.fee_distributor_address),
    liquidityLocker: normalizeAddress(row.liquidity_locker_address),
    additionalFee: Number(row.additional_fee),
    totalPoolFee: Number(row.total_pool_fee),
    creatorAllocationDestination: Number(row.creator_allocation_destination),
    additionalFeeDestination: Number(row.additional_fee_destination),
  }));
}

export type TransferThroughBlock = {
  from: string;
  to: string;
  amount: bigint;
  blockNumber: number;
  logIndex: number;
};

export async function listTokenTransfersThroughBlock(
  db: Queryable,
  args: { chainId: number; tokenAddress: string; snapshotBlock: number },
): Promise<TransferThroughBlock[]> {
  const result = await db.query<{
    from_address: string;
    to_address: string;
    amount_raw: string;
    block_number: string;
    log_index: number;
  }>(
    `SELECT from_address, to_address, amount_raw, block_number, log_index
     FROM transfers
     WHERE chain_id = $1
       AND token_address = $2
       AND block_number <= $3
     ORDER BY block_number ASC, log_index ASC`,
    [
      args.chainId,
      normalizeAddress(args.tokenAddress),
      toNumericString(args.snapshotBlock),
    ],
  );
  return result.rows.map((row) => ({
    from: normalizeAddress(row.from_address),
    to: normalizeAddress(row.to_address),
    amount: BigInt(row.amount_raw),
    blockNumber: Number(row.block_number),
    logIndex: Number(row.log_index),
  }));
}

export type SnapshotBlockCandidate = {
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
};

/**
 * Highest processed block with timestamp <= hourEndUnix.
 * Requires non-null block_timestamp.
 */
export async function resolveSnapshotBlockForHourEnd(
  db: Queryable,
  args: { chainId: number; hourEndUnix: number },
): Promise<SnapshotBlockCandidate | null> {
  const result = await db.query<{
    block_number: string;
    block_hash: string;
    block_timestamp: string;
  }>(
    `SELECT block_number, block_hash, block_timestamp
     FROM processed_blocks
     WHERE chain_id = $1
       AND block_timestamp IS NOT NULL
       AND block_timestamp <= $2
     ORDER BY block_number DESC
     LIMIT 1`,
    [args.chainId, toNumericString(args.hourEndUnix)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    blockNumber: Number(row.block_number),
    blockHash: normalizeBytes32(row.block_hash),
    blockTimestamp: Number(row.block_timestamp),
  };
}

export async function getIndexerMainCheckpointBlock(
  db: Queryable,
  chainId: number,
): Promise<number | null> {
  const result = await db.query<{ last_block_number: string }>(
    `SELECT last_block_number FROM indexer_checkpoints
     WHERE chain_id = $1 AND stream_name = 'main'`,
    [chainId],
  );
  const row = result.rows[0];
  return row ? Number(row.last_block_number) : null;
}

export async function listDepositAssetsForVault(
  db: Queryable,
  args: { chainId: number; vaultAddress: string },
): Promise<string[]> {
  const result = await db.query<{ asset_address: string }>(
    `SELECT DISTINCT asset_address
     FROM holder_reward_deposits
     WHERE chain_id = $1 AND vault_address = $2
     ORDER BY asset_address ASC`,
    [args.chainId, normalizeAddress(args.vaultAddress)],
  );
  return result.rows.map((r) => normalizeAddress(r.asset_address));
}

export type WorkerRoundStatus =
  | 'pending'
  | 'snapshot_ready'
  | 'computed'
  | 'publish_ready'
  | 'published'
  | 'push_in_progress'
  | 'settled'
  | 'failed'
  | 'skipped_no_reward'
  | 'skipped_no_holders'
  | 'snapshot_not_ready';

export type WorkerRoundRow = {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  roundId: number;
  assetAddress: string;
  snapshotBlock: number;
  hourEndUnix: number;
  merkleRoot: string | null;
  rewardAmountRaw: string;
  eligibleSupplyRaw: string | null;
  leafCount: number;
  status: WorkerRoundStatus;
};

export async function getWorkerRound(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number;
    assetAddress: string;
  },
): Promise<WorkerRoundRow | null> {
  const result = await db.query<{
    chain_id: string;
    vault_address: string;
    token_address: string;
    round_id: string;
    asset_address: string;
    snapshot_block: string;
    hour_end_unix: string;
    merkle_root: string | null;
    reward_amount_raw: string;
    eligible_supply_raw: string | null;
    leaf_count: number;
    status: WorkerRoundStatus;
  }>(
    `SELECT *
     FROM holder_reward_worker_rounds
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3 AND asset_address = $4`,
    [
      args.chainId,
      normalizeAddress(args.vaultAddress),
      toNumericString(args.roundId),
      normalizeAddress(args.assetAddress),
    ],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    chainId: Number(row.chain_id),
    vaultAddress: row.vault_address,
    tokenAddress: row.token_address,
    roundId: Number(row.round_id),
    assetAddress: row.asset_address,
    snapshotBlock: Number(row.snapshot_block),
    hourEndUnix: Number(row.hour_end_unix),
    merkleRoot: row.merkle_root,
    rewardAmountRaw: row.reward_amount_raw,
    eligibleSupplyRaw: row.eligible_supply_raw,
    leafCount: row.leaf_count,
    status: row.status,
  };
}

export async function upsertWorkerRoundComputed(
  db: Queryable,
  row: {
    chainId: number;
    vaultAddress: string;
    tokenAddress: string;
    roundId: number;
    assetAddress: string;
    snapshotBlock: number;
    hourEndUnix: number;
    merkleRoot: string;
    rewardAmountRaw: string | bigint;
    eligibleSupplyRaw: string | bigint;
    leafCount: number;
    status: WorkerRoundStatus;
  },
): Promise<void> {
  const vault = normalizeAddress(row.vaultAddress);
  const asset = normalizeAddress(row.assetAddress);
  const root = normalizeBytes32(row.merkleRoot);
  const existing = await getWorkerRound(db, {
    chainId: row.chainId,
    vaultAddress: vault,
    roundId: row.roundId,
    assetAddress: asset,
  });
  if (existing?.merkleRoot && existing.merkleRoot !== root) {
    throw new Error(
      `worker round root immutable conflict vault=${vault} round=${row.roundId} asset=${asset}`,
    );
  }
  await db.query(
    `INSERT INTO holder_reward_worker_rounds (
      chain_id, vault_address, token_address, round_id, asset_address,
      snapshot_block, hour_end_unix, merkle_root, reward_amount_raw,
      eligible_supply_raw, leaf_count, status, computed_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
    ON CONFLICT (chain_id, vault_address, round_id, asset_address) DO UPDATE SET
      snapshot_block = EXCLUDED.snapshot_block,
      hour_end_unix = EXCLUDED.hour_end_unix,
      merkle_root = EXCLUDED.merkle_root,
      reward_amount_raw = EXCLUDED.reward_amount_raw,
      eligible_supply_raw = EXCLUDED.eligible_supply_raw,
      leaf_count = EXCLUDED.leaf_count,
      status = EXCLUDED.status,
      computed_at = NOW(),
      updated_at = NOW(),
      last_error = NULL`,
    [
      row.chainId,
      vault,
      normalizeAddress(row.tokenAddress),
      toNumericString(row.roundId),
      asset,
      toNumericString(row.snapshotBlock),
      toNumericString(row.hourEndUnix),
      root,
      toNumericString(row.rewardAmountRaw),
      toNumericString(row.eligibleSupplyRaw),
      row.leafCount,
      row.status,
    ],
  );
}

export async function replaceWorkerEntitlements(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number;
    assetAddress: string;
    snapshotBlock: number;
    eligibleSupplyRaw: string | bigint;
    rewardAmountRaw: string | bigint;
    entitlements: Array<{
      account: string;
      balanceRaw: string | bigint;
      entitlementRaw: string | bigint;
      leafHash: string;
      leafIndex: number;
      proof: string[];
    }>;
  },
): Promise<void> {
  const vault = normalizeAddress(args.vaultAddress);
  const asset = normalizeAddress(args.assetAddress);
  await db.query(
    `DELETE FROM holder_reward_entitlements
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3 AND asset_address = $4`,
    [args.chainId, vault, toNumericString(args.roundId), asset],
  );
  for (const e of args.entitlements) {
    await db.query(
      `INSERT INTO holder_reward_entitlements (
        chain_id, vault_address, round_id, asset_address, account_address,
        snapshot_block, balance_raw, eligible_supply_raw, reward_amount_raw,
        entitlement_raw, leaf_hash, leaf_index, proof_json, push_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'unpaid')`,
      [
        args.chainId,
        vault,
        toNumericString(args.roundId),
        asset,
        normalizeAddress(e.account),
        toNumericString(args.snapshotBlock),
        toNumericString(e.balanceRaw),
        toNumericString(args.eligibleSupplyRaw),
        toNumericString(args.rewardAmountRaw),
        toNumericString(e.entitlementRaw),
        normalizeBytes32(e.leafHash),
        e.leafIndex,
        JSON.stringify(e.proof),
      ],
    );
  }
}

export async function upsertWorkerRoundStatus(
  db: Queryable,
  row: {
    chainId: number;
    vaultAddress: string;
    tokenAddress: string;
    roundId: number;
    assetAddress: string;
    snapshotBlock: number;
    hourEndUnix: number;
    rewardAmountRaw?: string | bigint;
    status: WorkerRoundStatus;
    lastError?: string | null;
    merkleRoot?: string | null;
  },
): Promise<void> {
  const vault = normalizeAddress(row.vaultAddress);
  const asset = normalizeAddress(row.assetAddress);
  await db.query(
    `INSERT INTO holder_reward_worker_rounds (
      chain_id, vault_address, token_address, round_id, asset_address,
      snapshot_block, hour_end_unix, merkle_root, reward_amount_raw,
      leaf_count, status, last_error, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,NOW())
    ON CONFLICT (chain_id, vault_address, round_id, asset_address) DO UPDATE SET
      status = EXCLUDED.status,
      last_error = EXCLUDED.last_error,
      updated_at = NOW()`,
    [
      row.chainId,
      vault,
      normalizeAddress(row.tokenAddress),
      toNumericString(row.roundId),
      asset,
      toNumericString(row.snapshotBlock),
      toNumericString(row.hourEndUnix),
      row.merkleRoot ? normalizeBytes32(row.merkleRoot) : null,
      toNumericString(row.rewardAmountRaw ?? 0),
      row.status,
      row.lastError ?? null,
    ],
  );
}

export async function markWorkerRoundPublished(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number;
    assetAddress: string;
    txHash: string;
  },
): Promise<void> {
  await db.query(
    `UPDATE holder_reward_worker_rounds SET
       status = 'published',
       published_tx_hash = $5,
       published_at = NOW(),
       updated_at = NOW(),
       last_error = NULL
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3 AND asset_address = $4`,
    [
      args.chainId,
      normalizeAddress(args.vaultAddress),
      toNumericString(args.roundId),
      normalizeAddress(args.assetAddress),
      normalizeBytes32(args.txHash),
    ],
  );
}

export type WorkerEntitlementRow = {
  account: string;
  balanceRaw: string;
  entitlementRaw: string;
  leafHash: string;
  leafIndex: number;
  proof: string[];
  pushStatus: string;
};

export async function listWorkerEntitlements(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number;
    assetAddress: string;
    unpaidOnly?: boolean;
  },
): Promise<WorkerEntitlementRow[]> {
  const result = await db.query<{
    account_address: string;
    balance_raw: string;
    entitlement_raw: string;
    leaf_hash: string;
    leaf_index: number;
    proof_json: string[] | string;
    push_status: string;
  }>(
    `SELECT account_address, balance_raw, entitlement_raw, leaf_hash, leaf_index, proof_json, push_status
     FROM holder_reward_entitlements
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3 AND asset_address = $4
       AND ($5::boolean IS FALSE OR push_status = 'unpaid')
     ORDER BY account_address ASC`,
    [
      args.chainId,
      normalizeAddress(args.vaultAddress),
      toNumericString(args.roundId),
      normalizeAddress(args.assetAddress),
      Boolean(args.unpaidOnly),
    ],
  );
  return result.rows.map((row) => ({
    account: normalizeAddress(row.account_address),
    balanceRaw: String(row.balance_raw),
    entitlementRaw: String(row.entitlement_raw),
    leafHash: normalizeBytes32(row.leaf_hash),
    leafIndex: Number(row.leaf_index),
    proof: Array.isArray(row.proof_json)
      ? row.proof_json
      : (JSON.parse(String(row.proof_json)) as string[]),
    pushStatus: row.push_status,
  }));
}

export async function updateEntitlementPushStatus(
  db: Queryable,
  args: {
    chainId: number;
    vaultAddress: string;
    roundId: number;
    assetAddress: string;
    account: string;
    pushStatus: 'unpaid' | 'paid' | 'failed' | 'skipped';
  },
): Promise<void> {
  await db.query(
    `UPDATE holder_reward_entitlements SET
       push_status = $5,
       updated_at = NOW()
     WHERE chain_id = $1 AND vault_address = $2 AND round_id = $3
       AND asset_address = $4 AND account_address = $6`,
    [
      args.chainId,
      normalizeAddress(args.vaultAddress),
      toNumericString(args.roundId),
      normalizeAddress(args.assetAddress),
      args.pushStatus,
      normalizeAddress(args.account),
    ],
  );
}

/** Earliest indexed deposit unix for vault (catch-up lower bound). */
export async function getEarliestVaultDepositUnix(
  db: Queryable,
  args: { chainId: number; vaultAddress: string },
): Promise<number | null> {
  const result = await db.query<{ ts: string | null }>(
    `SELECT MIN(block_timestamp)::text AS ts
     FROM holder_reward_deposits
     WHERE chain_id = $1 AND vault_address = $2
       AND block_timestamp IS NOT NULL`,
    [args.chainId, normalizeAddress(args.vaultAddress)],
  );
  const raw = result.rows[0]?.ts;
  if (raw == null) return null;
  return Number(raw);
}
