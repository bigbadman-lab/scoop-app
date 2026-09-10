import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32 } from '../hex.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Canonical live market row for fee keeper servicing. */
export type FeeKeeperMarket = {
  chainId: number;
  tokenAddress: string;
  quoteAsset: string;
  poolId: string;
  lpTokenId: string;
  liquidityLocker: string;
  feeDistributor: string;
  creatorId: string;
  deployer: string;
  launchTxHash: string;
  launchedAt: number;
  /** Unix seconds; null when no trades projected yet. */
  lastTradeAt: number | null;
};

/**
 * Enumerate canonical SCOOP markets ready for fee collect/distribute.
 * Hardens against zero sentinels and pool/launch metadata mismatch.
 * Does not hardcode token addresses.
 */
export async function listFeeKeeperMarkets(
  db: Queryable,
  chainId: number,
): Promise<FeeKeeperMarket[]> {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }

  const result = await db.query<{
    chain_id: number;
    token_address: string;
    quote_asset: string;
    pool_id: string;
    lp_token_id: string | number;
    liquidity_locker_address: string;
    fee_distributor_address: string;
    creator_id: string;
    deployer_address: string;
    launch_tx_hash: string;
    launched_at: string | number;
    last_trade_at: string | number | null;
  }>(
    `SELECT
       l.chain_id,
       l.token_address,
       l.quote_asset,
       l.pool_id,
       l.lp_token_id,
       l.liquidity_locker_address,
       l.fee_distributor_address,
       l.creator_id,
       l.deployer_address,
       l.launch_tx_hash,
       l.launched_at,
       m.last_trade_at
     FROM launches l
     INNER JOIN tokens t
       ON t.chain_id = l.chain_id AND t.token_address = l.token_address
     INNER JOIN pools p
       ON p.chain_id = l.chain_id AND p.pool_id = l.pool_id
     LEFT JOIN token_market_state m
       ON m.chain_id = l.chain_id AND m.token_address = l.token_address
     WHERE l.chain_id = $1
       AND l.liquidity_locker_address <> $2
       AND l.fee_distributor_address <> $2
       AND l.pool_id <> $3
       AND l.lp_token_id > 0
       AND p.lp_token_id = l.lp_token_id
       AND p.liquidity_locker_address = l.liquidity_locker_address
     ORDER BY l.launched_at ASC`,
    [chainId, ZERO_ADDRESS, ZERO_BYTES32],
  );

  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(String(row.token_address)),
    quoteAsset: normalizeAddress(String(row.quote_asset)),
    poolId: normalizeBytes32(String(row.pool_id)),
    lpTokenId: String(row.lp_token_id),
    liquidityLocker: normalizeAddress(String(row.liquidity_locker_address)),
    feeDistributor: normalizeAddress(String(row.fee_distributor_address)),
    creatorId: normalizeBytes32(String(row.creator_id)),
    deployer: normalizeAddress(String(row.deployer_address)),
    launchTxHash: normalizeBytes32(String(row.launch_tx_hash)),
    launchedAt: Number(row.launched_at),
    lastTradeAt:
      row.last_trade_at == null || String(row.last_trade_at).trim() === ''
        ? null
        : Number(row.last_trade_at),
  }));
}
