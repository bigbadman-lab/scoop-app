import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

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
}

export async function upsertLaunch(db: Queryable, row: LaunchRow): Promise<void> {
  await db.query(
    `INSERT INTO launches (
      chain_id, token_address, factory_address, deployer_address, creator_id, quote_asset,
      fee_distributor_address, liquidity_locker_address, pool_id, lp_token_id,
      opening_sqrt_price_x96, opening_tick, tick_lower, tick_upper,
      launch_tx_hash, launch_block, launch_log_index, launched_at, launch_fee_raw,
      initial_buy_present, initial_buy_quote_raw, initial_buy_tokens_raw, metadata_hydrated
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
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
    ],
  );
}
