import type { Queryable } from '@scoop/db';
import { normalizeAddress, normalizeBytes32, BASE_FEE, TICK_SPACING } from '@scoop/shared';

export interface WatchlistEntry {
  chainId: number;
  tokenAddress: string;
  poolId: string;
  feeDistributorAddress: string;
  liquidityLockerAddress: string;
  /** Null for historical canaries without HolderRewards. */
  holderRewardsAddress: string | null;
  quoteAsset: string;
  factoryAddress: string;
  deployerAddress: string;
  creatorId: string;
  tickLower: number;
  tickUpper: number;
  openingSqrtPriceX96: string;
  lpTokenId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  tokenIsCurrency1: boolean;
  /** From tokens.decimals (canonical). */
  tokenDecimals: number;
  /** From quote_assets.decimals (canonical); 18 if catalogue miss. */
  quoteDecimals: number;
}

export interface Watchlist {
  tokens: Map<string, WatchlistEntry>;
  pools: Map<string, WatchlistEntry>;
  distributors: Map<string, WatchlistEntry>;
  holderVaults: Map<string, WatchlistEntry>;
  lockers: Set<string>;
  tokenAddresses: string[];
  distributorAddresses: string[];
  holderVaultAddresses: string[];
}

function emptyWatchlist(): Watchlist {
  return {
    tokens: new Map(),
    pools: new Map(),
    distributors: new Map(),
    holderVaults: new Map(),
    lockers: new Set(),
    tokenAddresses: [],
    distributorAddresses: [],
    holderVaultAddresses: [],
  };
}

function addEntry(wl: Watchlist, entry: WatchlistEntry): void {
  const token = normalizeAddress(entry.tokenAddress);
  const pool = normalizeBytes32(entry.poolId);
  const dist = normalizeAddress(entry.feeDistributorAddress);
  const locker = normalizeAddress(entry.liquidityLockerAddress);
  wl.tokens.set(token, entry);
  wl.pools.set(pool, entry);
  wl.distributors.set(dist, entry);
  wl.lockers.add(locker);
  if (entry.holderRewardsAddress) {
    if (!wl.holderVaults) wl.holderVaults = new Map();
    const vault = normalizeAddress(entry.holderRewardsAddress);
    wl.holderVaults.set(vault, entry);
  }
  wl.tokenAddresses = [...wl.tokens.keys()];
  wl.distributorAddresses = [...wl.distributors.keys()];
  if (!wl.holderVaults) wl.holderVaults = new Map();
  wl.holderVaultAddresses = [...wl.holderVaults.keys()];
}

/** Load watched tokens/pools/distributors/lockers/holder vaults from launches + pools. */
export async function loadWatchlist(db: Queryable, chainId: number): Promise<Watchlist> {
  const wl = emptyWatchlist();
  const result = await db.query<{
    chain_id: string;
    token_address: string;
    pool_id: string;
    fee_distributor_address: string;
    liquidity_locker_address: string;
    holder_rewards_address: string | null;
    quote_asset: string;
    factory_address: string;
    deployer_address: string;
    creator_id: string;
    tick_lower: number;
    tick_upper: number;
    opening_sqrt_price_x96: string;
    lp_token_id: string;
    currency0: string | null;
    currency1: string | null;
    fee: number | null;
    tick_spacing: number | null;
    hooks: string | null;
    token_decimals: number | null;
    quote_decimals: number | null;
    total_pool_fee: number | null;
  }>(
    `SELECT
      l.chain_id, l.token_address, l.pool_id, l.fee_distributor_address,
      l.liquidity_locker_address, l.holder_rewards_address, l.quote_asset, l.factory_address,
      l.deployer_address, l.creator_id, l.tick_lower, l.tick_upper, l.opening_sqrt_price_x96,
      l.lp_token_id, l.total_pool_fee,
      p.currency0, p.currency1, p.fee, p.tick_spacing, p.hooks,
      t.decimals AS token_decimals, q.decimals AS quote_decimals
     FROM launches l
     LEFT JOIN pools p ON p.chain_id = l.chain_id AND p.pool_id = l.pool_id
     LEFT JOIN tokens t ON t.chain_id = l.chain_id AND t.token_address = l.token_address
     LEFT JOIN quote_assets q ON q.chain_id = l.chain_id AND q.quote_asset = l.quote_asset
     WHERE l.chain_id = $1`,
    [chainId],
  );

  for (const row of result.rows) {
    const quote = normalizeAddress(row.quote_asset);
    const token = normalizeAddress(row.token_address);
    const currency0 = row.currency0 ? normalizeAddress(row.currency0) : quote;
    const currency1 = row.currency1 ? normalizeAddress(row.currency1) : token;
    const poolFee =
      row.fee ??
      (row.total_pool_fee != null ? Number(row.total_pool_fee) : null) ??
      BASE_FEE;
    addEntry(wl, {
      chainId: Number(row.chain_id),
      tokenAddress: token,
      poolId: normalizeBytes32(row.pool_id),
      feeDistributorAddress: normalizeAddress(row.fee_distributor_address),
      liquidityLockerAddress: normalizeAddress(row.liquidity_locker_address),
      holderRewardsAddress: row.holder_rewards_address
        ? normalizeAddress(row.holder_rewards_address)
        : null,
      quoteAsset: quote,
      factoryAddress: normalizeAddress(row.factory_address),
      deployerAddress: normalizeAddress(row.deployer_address),
      creatorId: normalizeBytes32(row.creator_id),
      tickLower: row.tick_lower,
      tickUpper: row.tick_upper,
      openingSqrtPriceX96: row.opening_sqrt_price_x96,
      lpTokenId: row.lp_token_id,
      currency0,
      currency1,
      fee: poolFee,
      tickSpacing: row.tick_spacing ?? TICK_SPACING,
      hooks: row.hooks ? normalizeAddress(row.hooks) : quote,
      tokenIsCurrency1: currency1 === token,
      tokenDecimals: row.token_decimals ?? 18,
      quoteDecimals: row.quote_decimals ?? 18,
    });
  }
  return wl;
}

/** Register a newly discovered launch into an in-memory watchlist. */
export function watchlistAddLaunch(
  wl: Watchlist,
  entry: Omit<
    WatchlistEntry,
    'tokenIsCurrency1' | 'tokenDecimals' | 'quoteDecimals' | 'holderRewardsAddress'
  > & {
    tokenIsCurrency1?: boolean;
    tokenDecimals?: number;
    quoteDecimals?: number;
    holderRewardsAddress?: string | null;
  },
): WatchlistEntry {
  const token = normalizeAddress(entry.tokenAddress);
  const full: WatchlistEntry = {
    ...entry,
    tokenAddress: token,
    poolId: normalizeBytes32(entry.poolId),
    feeDistributorAddress: normalizeAddress(entry.feeDistributorAddress),
    liquidityLockerAddress: normalizeAddress(entry.liquidityLockerAddress),
    holderRewardsAddress: entry.holderRewardsAddress
      ? normalizeAddress(entry.holderRewardsAddress)
      : null,
    quoteAsset: normalizeAddress(entry.quoteAsset),
    factoryAddress: normalizeAddress(entry.factoryAddress),
    deployerAddress: normalizeAddress(entry.deployerAddress),
    creatorId: normalizeBytes32(entry.creatorId),
    currency0: normalizeAddress(entry.currency0),
    currency1: normalizeAddress(entry.currency1),
    hooks: normalizeAddress(entry.hooks),
    tokenIsCurrency1:
      entry.tokenIsCurrency1 ?? normalizeAddress(entry.currency1) === token,
    tokenDecimals: entry.tokenDecimals ?? 18,
    quoteDecimals: entry.quoteDecimals ?? 18,
  };
  addEntry(wl, full);
  return full;
}

export function watchlistSize(wl: Watchlist): number {
  return wl.tokens.size;
}
