import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface PoolRow {
  chainId: number;
  poolId: string;
  tokenAddress: string;
  quoteAsset: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  lpTokenId: string | bigint | number;
  liquidityLockerAddress: string;
  initializedTxHash: string;
  initializedBlock: number | bigint;
  initializedAt: number | bigint;
  openingSqrtPriceX96: string | bigint;
  openingTick: number;
  currentSqrtPriceX96?: string | bigint | null;
  currentTick?: number | null;
  currentLiquidityRaw?: string | bigint | null;
  lastSwapBlock?: number | bigint | null;
}

export async function upsertPool(db: Queryable, row: PoolRow): Promise<void> {
  await db.query(
    `INSERT INTO pools (
      chain_id, pool_id, token_address, quote_asset, currency0, currency1,
      fee, tick_spacing, hooks, lp_token_id, liquidity_locker_address,
      initialized_tx_hash, initialized_block, initialized_at,
      opening_sqrt_price_x96, opening_tick,
      current_sqrt_price_x96, current_tick, current_liquidity_raw, last_swap_block
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )
    ON CONFLICT (chain_id, pool_id) DO UPDATE SET
      token_address = EXCLUDED.token_address,
      quote_asset = EXCLUDED.quote_asset,
      currency0 = EXCLUDED.currency0,
      currency1 = EXCLUDED.currency1,
      fee = EXCLUDED.fee,
      tick_spacing = EXCLUDED.tick_spacing,
      hooks = EXCLUDED.hooks,
      lp_token_id = EXCLUDED.lp_token_id,
      liquidity_locker_address = EXCLUDED.liquidity_locker_address,
      initialized_tx_hash = EXCLUDED.initialized_tx_hash,
      initialized_block = EXCLUDED.initialized_block,
      initialized_at = EXCLUDED.initialized_at,
      opening_sqrt_price_x96 = EXCLUDED.opening_sqrt_price_x96,
      opening_tick = EXCLUDED.opening_tick,
      current_sqrt_price_x96 = EXCLUDED.current_sqrt_price_x96,
      current_tick = EXCLUDED.current_tick,
      current_liquidity_raw = EXCLUDED.current_liquidity_raw,
      last_swap_block = EXCLUDED.last_swap_block,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeBytes32(row.poolId),
      normalizeAddress(row.tokenAddress),
      normalizeAddress(row.quoteAsset),
      normalizeAddress(row.currency0),
      normalizeAddress(row.currency1),
      row.fee,
      row.tickSpacing,
      normalizeAddress(row.hooks),
      toNumericString(row.lpTokenId),
      normalizeAddress(row.liquidityLockerAddress),
      normalizeBytes32(row.initializedTxHash),
      toNumericString(row.initializedBlock),
      toNumericString(row.initializedAt),
      toNumericString(row.openingSqrtPriceX96),
      row.openingTick,
      row.currentSqrtPriceX96 == null ? null : toNumericString(row.currentSqrtPriceX96),
      row.currentTick ?? null,
      row.currentLiquidityRaw == null ? null : toNumericString(row.currentLiquidityRaw),
      row.lastSwapBlock == null ? null : toNumericString(row.lastSwapBlock),
    ],
  );
}
