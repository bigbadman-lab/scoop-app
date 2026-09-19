import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32 } from '../hex.js';

/**
 * Canonical market-ready row: launch INNER JOIN token.
 * Matches token-page and News badge readiness (pool optional).
 * Gate 6: Pons markets are ready without a UV4 pool.
 */
export type LaunchMarketReady = {
  chainId: number;
  tokenAddress: string;
  launchTxHash: string;
  creatorId: string;
  quoteAsset: string;
  deployerAddress: string;
  /** Null for Pons pre-graduation. */
  poolId: string | null;
  /** Null for Pons pre-graduation. */
  feeDistributorAddress: string | null;
  /** Null for Pons pre-graduation. */
  liquidityLockerAddress: string | null;
  name: string;
  symbol: string;
  marketSource: 'scoop' | 'pons_v2';
  marketPhase: 'curve' | 'graduated_pool' | null;
  curveAddress: string | null;
};

export async function getLaunchMarketReady(
  db: Queryable,
  chainId: number,
  tokenAddressInput: string,
): Promise<LaunchMarketReady | null> {
  const tokenAddress = normalizeAddress(tokenAddressInput);
  const result = await db.query<{
    chain_id: number | string;
    token_address: string;
    launch_tx_hash: string;
    creator_id: string;
    quote_asset: string;
    deployer_address: string;
    pool_id: string | null;
    fee_distributor_address: string | null;
    liquidity_locker_address: string | null;
    name: string;
    symbol: string;
    market_source: string | null;
    graduation_status: string | null;
    curve_address: string | null;
  }>(
    `
    SELECT
      l.chain_id,
      l.token_address,
      l.launch_tx_hash,
      l.creator_id,
      l.quote_asset,
      l.deployer_address,
      l.pool_id,
      l.fee_distributor_address,
      l.liquidity_locker_address,
      t.name,
      t.symbol,
      COALESCE(l.market_source, 'scoop') AS market_source,
      l.graduation_status,
      l.curve_address
    FROM launches l
    INNER JOIN tokens t
      ON t.chain_id = l.chain_id AND t.token_address = l.token_address
    WHERE l.chain_id = $1 AND l.token_address = $2
    LIMIT 1
    `,
    [chainId, tokenAddress],
  );

  const row = result.rows[0];
  if (!row) return null;

  const marketSource =
    row.market_source === 'pons_v2' ? ('pons_v2' as const) : ('scoop' as const);
  const marketPhase =
    marketSource !== 'pons_v2'
      ? null
      : row.graduation_status === 'graduated'
        ? ('graduated_pool' as const)
        : ('curve' as const);

  return {
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    launchTxHash: normalizeBytes32(row.launch_tx_hash),
    creatorId: normalizeBytes32(row.creator_id),
    quoteAsset: normalizeAddress(row.quote_asset),
    deployerAddress: normalizeAddress(row.deployer_address),
    poolId:
      row.pool_id == null || row.pool_id === ''
        ? null
        : normalizeBytes32(row.pool_id),
    feeDistributorAddress:
      row.fee_distributor_address == null || row.fee_distributor_address === ''
        ? null
        : normalizeAddress(row.fee_distributor_address),
    liquidityLockerAddress:
      row.liquidity_locker_address == null || row.liquidity_locker_address === ''
        ? null
        : normalizeAddress(row.liquidity_locker_address),
    name: String(row.name),
    symbol: String(row.symbol),
    marketSource,
    marketPhase,
    curveAddress:
      row.curve_address == null || row.curve_address === ''
        ? null
        : normalizeAddress(row.curve_address),
  };
}
