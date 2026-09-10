import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32 } from '../hex.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Must match ScoopFeeTypes enum ordinals (Creator = 0).
 * Kept as literals here so @scoop/db does not depend on contracts for discovery.
 */
const HISTORICAL_CREATOR_ALLOCATION_DESTINATION = 0;
const HISTORICAL_ADDITIONAL_FEE_DESTINATION = 0;
const HISTORICAL_ADDITIONAL_FEE = 0;
const HISTORICAL_TOTAL_POOL_FEE = 10_000;

/** Fee-keeper discovery mode — selects SQL compatible with the target schema. */
export type FeeKeeperDiscoveryMode = 'historical-test' | 'canonical-production';

/** Canonical live market row for fee keeper servicing. */
export type FeeKeeperMarket = {
  chainId: number;
  tokenAddress: string;
  quoteAsset: string;
  poolId: string;
  lpTokenId: string;
  liquidityLocker: string;
  feeDistributor: string;
  /** Null for historical canaries without HolderRewards. */
  holderRewards: string | null;
  additionalFee: number;
  totalPoolFee: number;
  creatorAllocationDestination: number;
  additionalFeeDestination: number;
  creatorId: string;
  deployer: string;
  launchTxHash: string;
  launchedAt: number;
  /** Unix seconds; null when no trades projected yet. */
  lastTradeAt: number | null;
};

type FeeKeeperMarketRow = {
  chain_id: number;
  token_address: string;
  quote_asset: string;
  pool_id: string;
  lp_token_id: string | number;
  liquidity_locker_address: string;
  fee_distributor_address: string;
  holder_rewards_address?: string | null;
  additional_fee?: number | null;
  total_pool_fee?: number | null;
  creator_allocation_destination?: number | null;
  additional_fee_destination?: number | null;
  creator_id: string;
  deployer_address: string;
  launch_tx_hash: string;
  launched_at: string | number;
  last_trade_at: string | number | null;
};

/**
 * Pre-P5 launches schema — must not reference holder_rewards_address / fee routing columns.
 * PostgreSQL errors on missing columns even inside COALESCE.
 */
const HISTORICAL_FEE_KEEPER_SQL = `SELECT
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
     ORDER BY l.launched_at ASC`;

/** P5+ launches schema with fee/holder routing columns. */
const CANONICAL_FEE_KEEPER_SQL = `SELECT
       l.chain_id,
       l.token_address,
       l.quote_asset,
       l.pool_id,
       l.lp_token_id,
       l.liquidity_locker_address,
       l.fee_distributor_address,
       l.holder_rewards_address,
       l.additional_fee,
       l.total_pool_fee,
       l.creator_allocation_destination,
       l.additional_fee_destination,
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
     ORDER BY l.launched_at ASC`;

const P5_ONLY_COLUMN_MARKERS = [
  'holder_rewards_address',
  'additional_fee',
  'total_pool_fee',
  'creator_allocation_destination',
  'additional_fee_destination',
] as const;

function mapFeeKeeperRow(
  row: FeeKeeperMarketRow,
  mode: FeeKeeperDiscoveryMode,
): FeeKeeperMarket {
  let holderRewards: string | null = null;
  let additionalFee = HISTORICAL_ADDITIONAL_FEE;
  let totalPoolFee = HISTORICAL_TOTAL_POOL_FEE;
  let creatorAllocationDestination = HISTORICAL_CREATOR_ALLOCATION_DESTINATION;
  let additionalFeeDestination = HISTORICAL_ADDITIONAL_FEE_DESTINATION;

  if (mode === 'canonical-production') {
    const holderRaw = row.holder_rewards_address;
    holderRewards =
      holderRaw == null ||
      String(holderRaw).trim() === '' ||
      String(holderRaw).toLowerCase() === ZERO_ADDRESS
        ? null
        : normalizeAddress(String(holderRaw));
    additionalFee = Number(row.additional_fee ?? 0);
    totalPoolFee = Number(row.total_pool_fee ?? 10_000);
    creatorAllocationDestination = Number(
      row.creator_allocation_destination ?? 0,
    );
    additionalFeeDestination = Number(row.additional_fee_destination ?? 0);
  }

  return {
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(String(row.token_address)),
    quoteAsset: normalizeAddress(String(row.quote_asset)),
    poolId: normalizeBytes32(String(row.pool_id)),
    lpTokenId: String(row.lp_token_id),
    liquidityLocker: normalizeAddress(String(row.liquidity_locker_address)),
    feeDistributor: normalizeAddress(String(row.fee_distributor_address)),
    holderRewards,
    additionalFee,
    totalPoolFee,
    creatorAllocationDestination,
    additionalFeeDestination,
    creatorId: normalizeBytes32(String(row.creator_id)),
    deployer: normalizeAddress(String(row.deployer_address)),
    launchTxHash: normalizeBytes32(String(row.launch_tx_hash)),
    launchedAt: Number(row.launched_at),
    lastTradeAt:
      row.last_trade_at == null || String(row.last_trade_at).trim() === ''
        ? null
        : Number(row.last_trade_at),
  };
}

/**
 * Enumerate SCOOP markets ready for fee collect/distribute.
 * Hardens against zero sentinels and pool/launch metadata mismatch.
 * Does not hardcode token addresses.
 *
 * `deploymentMode` selects schema-compatible SQL:
 * - historical-test: pre-P5 columns only + in-memory fee defaults
 * - canonical-production: P5 fee/holder columns
 */
export async function listFeeKeeperMarkets(
  db: Queryable,
  chainId: number,
  options: { deploymentMode: FeeKeeperDiscoveryMode },
): Promise<FeeKeeperMarket[]> {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }
  const mode = options.deploymentMode;
  if (mode !== 'historical-test' && mode !== 'canonical-production') {
    throw new Error(`Invalid fee-keeper discovery mode: ${String(mode)}`);
  }

  const sql =
    mode === 'historical-test'
      ? HISTORICAL_FEE_KEEPER_SQL
      : CANONICAL_FEE_KEEPER_SQL;

  const result = await db.query<FeeKeeperMarketRow>(sql, [
    chainId,
    ZERO_ADDRESS,
    ZERO_BYTES32,
  ]);

  return result.rows.map((row) => mapFeeKeeperRow(row, mode));
}

/** Test helper: assert historical SQL never touches P5-only launch columns. */
export function historicalFeeKeeperSqlReferencesP5Columns(sql: string): boolean {
  return P5_ONLY_COLUMN_MARKERS.some((col) => sql.includes(col));
}

export function feeKeeperMarketsSqlForMode(
  mode: FeeKeeperDiscoveryMode,
): string {
  return mode === 'historical-test'
    ? HISTORICAL_FEE_KEEPER_SQL
    : CANONICAL_FEE_KEEPER_SQL;
}
