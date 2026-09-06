import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface FeeDistributionRow {
  chainId: number;
  feeDistributorAddress: string;
  scoopTokenAddress: string;
  assetKind: string;
  assetAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  totalRaw: string | bigint;
  creatorRaw: string | bigint;
  deployerRaw: string | bigint;
  buybackRaw: string | bigint;
  operationsRaw: string | bigint;
}

export async function upsertFeeDistribution(
  db: Queryable,
  row: FeeDistributionRow,
): Promise<void> {
  await db.query(
    `INSERT INTO fee_distributions (
      chain_id, fee_distributor_address, scooptoken_address, asset_kind, asset_address,
      tx_hash, log_index, block_number, block_hash, block_timestamp,
      total_raw, creator_raw, deployer_raw, buyback_raw, operations_raw
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      fee_distributor_address = EXCLUDED.fee_distributor_address,
      scooptoken_address = EXCLUDED.scooptoken_address,
      asset_kind = EXCLUDED.asset_kind,
      asset_address = EXCLUDED.asset_address,
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      total_raw = EXCLUDED.total_raw,
      creator_raw = EXCLUDED.creator_raw,
      deployer_raw = EXCLUDED.deployer_raw,
      buyback_raw = EXCLUDED.buyback_raw,
      operations_raw = EXCLUDED.operations_raw`,
    [
      row.chainId,
      normalizeAddress(row.feeDistributorAddress),
      normalizeAddress(row.scoopTokenAddress),
      row.assetKind,
      normalizeAddress(row.assetAddress),
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      toNumericString(row.totalRaw),
      toNumericString(row.creatorRaw),
      toNumericString(row.deployerRaw),
      toNumericString(row.buybackRaw),
      toNumericString(row.operationsRaw),
    ],
  );
}

export interface CreatorCreditRow {
  chainId: number;
  creatorId: string;
  sourceAddress: string;
  assetKind: string;
  assetAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  amountRaw: string | bigint;
}

export async function upsertCreatorCredit(db: Queryable, row: CreatorCreditRow): Promise<void> {
  await db.query(
    `INSERT INTO creator_credits (
      chain_id, creator_id, source_address, asset_kind, asset_address,
      tx_hash, log_index, block_number, block_hash, block_timestamp, amount_raw
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      creator_id = EXCLUDED.creator_id,
      source_address = EXCLUDED.source_address,
      asset_kind = EXCLUDED.asset_kind,
      asset_address = EXCLUDED.asset_address,
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      amount_raw = EXCLUDED.amount_raw`,
    [
      row.chainId,
      normalizeBytes32(row.creatorId),
      normalizeAddress(row.sourceAddress),
      row.assetKind,
      normalizeAddress(row.assetAddress),
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      toNumericString(row.amountRaw),
    ],
  );
}

export interface CreatorClaimRow {
  chainId: number;
  creatorId: string;
  payoutWallet: string;
  assetKind: string;
  assetAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  amountRaw: string | bigint;
}

export async function upsertCreatorClaim(db: Queryable, row: CreatorClaimRow): Promise<void> {
  await db.query(
    `INSERT INTO creator_claims (
      chain_id, creator_id, payout_wallet, asset_kind, asset_address,
      tx_hash, log_index, block_number, block_hash, block_timestamp, amount_raw
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      creator_id = EXCLUDED.creator_id,
      payout_wallet = EXCLUDED.payout_wallet,
      asset_kind = EXCLUDED.asset_kind,
      asset_address = EXCLUDED.asset_address,
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      amount_raw = EXCLUDED.amount_raw`,
    [
      row.chainId,
      normalizeBytes32(row.creatorId),
      normalizeAddress(row.payoutWallet),
      row.assetKind,
      normalizeAddress(row.assetAddress),
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      toNumericString(row.amountRaw),
    ],
  );
}

export interface CreatorClaimableRow {
  chainId: number;
  creatorId: string;
  assetKind: string;
  assetAddress: string;
  claimableRaw: string | bigint;
  sourceBlock: number | bigint;
}

export async function upsertCreatorClaimable(
  db: Queryable,
  row: CreatorClaimableRow,
): Promise<void> {
  await db.query(
    `INSERT INTO creator_claimable_state (
      chain_id, creator_id, asset_kind, asset_address, claimable_raw, source_block
    ) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (chain_id, creator_id, asset_kind, asset_address) DO UPDATE SET
      claimable_raw = EXCLUDED.claimable_raw,
      source_block = EXCLUDED.source_block,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeBytes32(row.creatorId),
      row.assetKind,
      normalizeAddress(row.assetAddress),
      toNumericString(row.claimableRaw),
      toNumericString(row.sourceBlock),
    ],
  );
}

export interface QuotePriceSnapshotRow {
  chainId: number;
  quoteAsset: string;
  priceUsdX18: string | bigint;
  sourceBlock?: number | bigint | null;
  observedAt?: Date | string;
}

export async function insertQuotePriceSnapshot(
  db: Queryable,
  row: QuotePriceSnapshotRow,
): Promise<void> {
  await db.query(
    `INSERT INTO quote_price_snapshots (
      chain_id, quote_asset, price_usd_x18, source_block, observed_at
    ) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, NOW()))`,
    [
      row.chainId,
      normalizeAddress(row.quoteAsset),
      toNumericString(row.priceUsdX18),
      row.sourceBlock == null ? null : toNumericString(row.sourceBlock),
      row.observedAt ?? null,
    ],
  );
}
