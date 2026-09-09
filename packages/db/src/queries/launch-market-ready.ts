import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32 } from '../hex.js';

/**
 * Canonical market-ready row: launch INNER JOIN token.
 * Matches token-page and News badge readiness (pool optional).
 */
export type LaunchMarketReady = {
  chainId: number;
  tokenAddress: string;
  launchTxHash: string;
  creatorId: string;
  quoteAsset: string;
  deployerAddress: string;
  poolId: string;
  feeDistributorAddress: string;
  liquidityLockerAddress: string;
  name: string;
  symbol: string;
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
    pool_id: string;
    fee_distributor_address: string;
    liquidity_locker_address: string;
    name: string;
    symbol: string;
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
      t.symbol
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

  return {
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    launchTxHash: normalizeBytes32(row.launch_tx_hash),
    creatorId: normalizeBytes32(row.creator_id),
    quoteAsset: normalizeAddress(row.quote_asset),
    deployerAddress: normalizeAddress(row.deployer_address),
    poolId: normalizeBytes32(row.pool_id),
    feeDistributorAddress: normalizeAddress(row.fee_distributor_address),
    liquidityLockerAddress: normalizeAddress(row.liquidity_locker_address),
    name: String(row.name),
    symbol: String(row.symbol),
  };
}
