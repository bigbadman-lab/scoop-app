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

export interface LatestQuotePriceRow {
  quoteAsset: string;
  priceUsdX18: string;
  observedAt: Date;
  quoteDecimals: number | null;
  oracleMaxAge: number | null;
}

/** Latest quote/USD snapshot joined with catalogue metadata (if present). */
export async function getLatestQuotePriceUsd(
  db: Queryable,
  chainId: number,
  quoteAsset: string,
): Promise<LatestQuotePriceRow | null> {
  const asset = normalizeAddress(quoteAsset);
  const result = await db.query<{
    price_usd_x18: string;
    observed_at: Date;
    decimals: number | null;
    oracle_max_age: number | null;
  }>(
    `SELECT s.price_usd_x18::text AS price_usd_x18, s.observed_at,
            q.decimals, q.oracle_max_age
     FROM quote_price_snapshots s
     LEFT JOIN quote_assets q
       ON q.chain_id = s.chain_id AND q.quote_asset = s.quote_asset
     WHERE s.chain_id = $1 AND s.quote_asset = $2
     ORDER BY s.observed_at DESC
     LIMIT 1`,
    [chainId, asset],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    quoteAsset: asset,
    priceUsdX18: String(row.price_usd_x18),
    observedAt: row.observed_at,
    quoteDecimals: row.decimals == null ? null : Number(row.decimals),
    oracleMaxAge: row.oracle_max_age == null ? null : Number(row.oracle_max_age),
  };
}

/**
 * Nearest snapshot at or before trade time (unix seconds), for trade-time USD.
 * Caller must still apply freshness vs trade timestamp.
 */
export async function getQuotePriceUsdAtOrBefore(
  db: Queryable,
  chainId: number,
  quoteAsset: string,
  atOrBeforeUnixSec: number,
): Promise<LatestQuotePriceRow | null> {
  const asset = normalizeAddress(quoteAsset);
  const result = await db.query<{
    price_usd_x18: string;
    observed_at: Date;
    decimals: number | null;
    oracle_max_age: number | null;
  }>(
    `SELECT s.price_usd_x18::text AS price_usd_x18, s.observed_at,
            q.decimals, q.oracle_max_age
     FROM quote_price_snapshots s
     LEFT JOIN quote_assets q
       ON q.chain_id = s.chain_id AND q.quote_asset = s.quote_asset
     WHERE s.chain_id = $1 AND s.quote_asset = $2
       AND s.observed_at <= to_timestamp($3::double precision)
     ORDER BY s.observed_at DESC
     LIMIT 1`,
    [chainId, asset, atOrBeforeUnixSec],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    quoteAsset: asset,
    priceUsdX18: String(row.price_usd_x18),
    observedAt: row.observed_at,
    quoteDecimals: row.decimals == null ? null : Number(row.decimals),
    oracleMaxAge: row.oracle_max_age == null ? null : Number(row.oracle_max_age),
  };
}

export interface SnapshotQuoteAssetRow {
  quoteAsset: string;
  symbol: string;
  decimals: number;
  oracleFeed: string;
  oracleMaxAge: number | null;
}

/**
 * Enabled registered quotes with a configured oracle feed (eligible for ScoopPriceOracle snapshots).
 * Does not invent prices for assets without a feed.
 */
export async function listSnapshotEligibleQuoteAssets(
  db: Queryable,
  chainId: number,
): Promise<SnapshotQuoteAssetRow[]> {
  const zero = '0x0000000000000000000000000000000000000000';
  const result = await db.query<{
    quote_asset: string;
    symbol: string;
    decimals: number;
    oracle_feed: string;
    oracle_max_age: number | null;
  }>(
    `SELECT quote_asset, symbol, decimals, oracle_feed, oracle_max_age
     FROM quote_assets
     WHERE chain_id = $1
       AND is_registered = TRUE
       AND is_enabled = TRUE
       AND oracle_feed IS NOT NULL
       AND lower(oracle_feed) <> $2
     ORDER BY sort_order ASC NULLS LAST, symbol ASC`,
    [chainId, zero],
  );
  return result.rows.map((row) => ({
    quoteAsset: normalizeAddress(row.quote_asset),
    symbol: String(row.symbol),
    decimals: Number(row.decimals),
    oracleFeed: normalizeAddress(row.oracle_feed),
    oracleMaxAge: row.oracle_max_age == null ? null : Number(row.oracle_max_age),
  }));
}

/** Catalogue decimals for a quote asset; null if not registered. */
export async function getQuoteAssetDecimals(
  db: Queryable,
  chainId: number,
  quoteAsset: string,
): Promise<number | null> {
  const result = await db.query<{ decimals: number }>(
    `SELECT decimals FROM quote_assets
     WHERE chain_id = $1 AND quote_asset = $2`,
    [chainId, normalizeAddress(quoteAsset)],
  );
  const row = result.rows[0];
  return row ? Number(row.decimals) : null;
}
