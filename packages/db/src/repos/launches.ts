import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

/** ScoopFeeTypes.CreatorAllocationDestination ordinals. */
export type CreatorAllocationDestinationOrdinal = 0 | 1;
/** ScoopFeeTypes.AdditionalFeeDestination ordinals. */
export type AdditionalFeeDestinationOrdinal = 0 | 1 | 2;

export interface LaunchRow {
  chainId: number;
  tokenAddress: string;
  factoryAddress: string;
  deployerAddress: string;
  creatorId: string;
  quoteAsset: string;
  feeDistributorAddress: string;
  liquidityLockerAddress: string;
  poolId: string;
  lpTokenId: string | bigint | number;
  openingSqrtPriceX96: string | bigint;
  openingTick: number;
  tickLower: number;
  tickUpper: number;
  launchTxHash: string;
  launchBlock: number | bigint;
  launchLogIndex: number;
  launchedAt: number | bigint;
  launchFeeRaw: string | bigint;
  initialBuyPresent: boolean;
  initialBuyQuoteRaw?: string | bigint | null;
  initialBuyTokensRaw?: string | bigint | null;
  metadataHydrated?: boolean;
  /** Uniswap v4 fee units; 0 when unset / historical default path. */
  additionalFee?: number;
  /** BASE_FEE + additionalFee. */
  totalPoolFee?: number;
  creatorAllocationDestination?: CreatorAllocationDestinationOrdinal;
  additionalFeeDestination?: AdditionalFeeDestinationOrdinal;
  /** Null for historical canaries without HolderRewards. */
  holderRewardsAddress?: string | null;
}

/**
 * Upsert launch. Economics fields use COALESCE so a later partial observation
 * (e.g. LaunchEconomicsConfigured) cannot null out values already set.
 */
export async function upsertLaunch(db: Queryable, row: LaunchRow): Promise<void> {
  const additionalFee = row.additionalFee ?? 0;
  const totalPoolFee = row.totalPoolFee ?? 10_000 + additionalFee;
  const creatorAlloc = row.creatorAllocationDestination ?? 0;
  const additionalDest = row.additionalFeeDestination ?? 0;
  const holderRewards =
    row.holderRewardsAddress == null || row.holderRewardsAddress === ''
      ? null
      : normalizeAddress(row.holderRewardsAddress);

  await db.query(
    `INSERT INTO launches (
      chain_id, token_address, factory_address, deployer_address, creator_id, quote_asset,
      fee_distributor_address, liquidity_locker_address, pool_id, lp_token_id,
      opening_sqrt_price_x96, opening_tick, tick_lower, tick_upper,
      launch_tx_hash, launch_block, launch_log_index, launched_at, launch_fee_raw,
      initial_buy_present, initial_buy_quote_raw, initial_buy_tokens_raw, metadata_hydrated,
      additional_fee, total_pool_fee, creator_allocation_destination, additional_fee_destination,
      holder_rewards_address
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28
    )
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
      factory_address = EXCLUDED.factory_address,
      deployer_address = EXCLUDED.deployer_address,
      creator_id = EXCLUDED.creator_id,
      quote_asset = EXCLUDED.quote_asset,
      fee_distributor_address = EXCLUDED.fee_distributor_address,
      liquidity_locker_address = EXCLUDED.liquidity_locker_address,
      pool_id = EXCLUDED.pool_id,
      lp_token_id = EXCLUDED.lp_token_id,
      opening_sqrt_price_x96 = EXCLUDED.opening_sqrt_price_x96,
      opening_tick = EXCLUDED.opening_tick,
      tick_lower = EXCLUDED.tick_lower,
      tick_upper = EXCLUDED.tick_upper,
      launch_tx_hash = EXCLUDED.launch_tx_hash,
      launch_block = EXCLUDED.launch_block,
      launch_log_index = EXCLUDED.launch_log_index,
      launched_at = EXCLUDED.launched_at,
      launch_fee_raw = EXCLUDED.launch_fee_raw,
      initial_buy_present = EXCLUDED.initial_buy_present,
      initial_buy_quote_raw = EXCLUDED.initial_buy_quote_raw,
      initial_buy_tokens_raw = EXCLUDED.initial_buy_tokens_raw,
      metadata_hydrated = EXCLUDED.metadata_hydrated,
      additional_fee = COALESCE(EXCLUDED.additional_fee, launches.additional_fee),
      total_pool_fee = COALESCE(EXCLUDED.total_pool_fee, launches.total_pool_fee),
      creator_allocation_destination = COALESCE(
        EXCLUDED.creator_allocation_destination,
        launches.creator_allocation_destination
      ),
      additional_fee_destination = COALESCE(
        EXCLUDED.additional_fee_destination,
        launches.additional_fee_destination
      ),
      holder_rewards_address = COALESCE(
        EXCLUDED.holder_rewards_address,
        launches.holder_rewards_address
      ),
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      normalizeAddress(row.factoryAddress),
      normalizeAddress(row.deployerAddress),
      normalizeBytes32(row.creatorId),
      normalizeAddress(row.quoteAsset),
      normalizeAddress(row.feeDistributorAddress),
      normalizeAddress(row.liquidityLockerAddress),
      normalizeBytes32(row.poolId),
      toNumericString(row.lpTokenId),
      toNumericString(row.openingSqrtPriceX96),
      row.openingTick,
      row.tickLower,
      row.tickUpper,
      normalizeBytes32(row.launchTxHash),
      toNumericString(row.launchBlock),
      row.launchLogIndex,
      toNumericString(row.launchedAt),
      toNumericString(row.launchFeeRaw),
      row.initialBuyPresent,
      row.initialBuyQuoteRaw == null ? null : toNumericString(row.initialBuyQuoteRaw),
      row.initialBuyTokensRaw == null ? null : toNumericString(row.initialBuyTokensRaw),
      row.metadataHydrated ?? false,
      additionalFee,
      totalPoolFee,
      creatorAlloc,
      additionalDest,
      holderRewards,
    ],
  );
}

/** Patch launch economics only (idempotent; never overwrites with null). */
export async function upsertLaunchEconomics(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    additionalFee: number;
    totalPoolFee: number;
    creatorAllocationDestination: CreatorAllocationDestinationOrdinal;
    additionalFeeDestination: AdditionalFeeDestinationOrdinal;
    holderRewardsAddress?: string | null;
    feeDistributorAddress?: string | null;
    liquidityLockerAddress?: string | null;
  },
): Promise<void> {
  const holderRewards =
    args.holderRewardsAddress == null || args.holderRewardsAddress === ''
      ? null
      : normalizeAddress(args.holderRewardsAddress);
  await db.query(
    `UPDATE launches SET
      additional_fee = $3,
      total_pool_fee = $4,
      creator_allocation_destination = $5,
      additional_fee_destination = $6,
      holder_rewards_address = COALESCE($7, holder_rewards_address),
      fee_distributor_address = COALESCE($8, fee_distributor_address),
      liquidity_locker_address = COALESCE($9, liquidity_locker_address),
      updated_at = NOW()
     WHERE chain_id = $1 AND token_address = $2`,
    [
      args.chainId,
      normalizeAddress(args.tokenAddress),
      args.additionalFee,
      args.totalPoolFee,
      args.creatorAllocationDestination,
      args.additionalFeeDestination,
      holderRewards,
      args.feeDistributorAddress == null
        ? null
        : normalizeAddress(args.feeDistributorAddress),
      args.liquidityLockerAddress == null
        ? null
        : normalizeAddress(args.liquidityLockerAddress),
    ],
  );
}
