/** Product DTOs — JSON-safe shapes for the web/API layer. Raw amounts are decimal strings. */

export type DiscoveryFilter = 'all' | 'new' | 'soon' | 'bonded';

export type DiscoverySort =
  | 'newest'
  | 'oldest'
  | 'volume24h'
  | 'fdv'
  | 'progress'
  | 'holders'
  | 'trades24h';

export type RankingType =
  | 'volume24h'
  | 'fdv'
  | 'gainers'
  | 'losers'
  | 'mostTraded'
  | 'mostHolders'
  | 'newest'
  | 'soon'
  | 'bonded';

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type TradeSide = 'buy' | 'sell';

export type ConfirmationStatus = 'pending' | 'confirmed' | 'finalized';

export interface TokenDiscoveryItem {
  chainId: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  imageUri: string;
  /** SCOOP-controlled HTTPS display copy; prefer over imageUri for UI. */
  displayImageUrl: string | null;
  poolId: string;
  creatorId: string;
  quoteAsset: string;
  launchedAt: number;
  ageSeconds: number;
  launchProgressBps: number;
  launchComplete: boolean;
  isNew: boolean;
  isSoon: boolean;
  isBonded: boolean;
  priceQuoteX18: string | null;
  priceQuoteDisplay: string | null;
  priceUsdX18: string | null;
  priceUsdDisplay: string | null;
  fdvUsdX18: string | null;
  fdvUsdDisplay: string | null;
  volume24hQuoteRaw: string | null;
  volume24hQuoteDisplay: string | null;
  volume24hUsdX18: string | null;
  volume24hUsdDisplay: string | null;
  tradeCount24h: number | null;
  holderCountAll: number | null;
  holderCountRetail: number | null;
  lastTradeAt: number | null;
  priceChange24hBps: number | null;
}

export interface TokenDetail extends TokenDiscoveryItem {
  description: string;
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
  totalSupplyRaw: string;
  totalSupplyDisplay: string;
  deployerAddress: string;
  factoryAddress: string;
  feeDistributorAddress: string;
  liquidityLockerAddress: string;
  sqrtPriceX96: string | null;
  tick: number | null;
  liquidityRaw: string | null;
  quoteUsdX18: string | null;
  quoteVolumeAllTimeRaw: string | null;
  tokenVolumeAllTimeRaw: string | null;
  tradeCountAllTime: number | null;
  buyCountAllTime: number | null;
  sellCountAllTime: number | null;
  initialTokenInventoryRaw: string | null;
  currentTokenInventoryRaw: string | null;
  sourceBlock: number | null;
}

export interface TradeItem {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: number;
  tokenAddress: string;
  poolId: string;
  side: TradeSide | string;
  /** Swap sender from PoolManager — not necessarily the EOA. */
  swapSender: string;
  /**
   * Transaction `from` when known. Never treat as guaranteed trader identity —
   * see traderAttributionType.
   */
  txFrom: string | null;
  traderAddress: string | null;
  traderAttributionType: string;
  quoteAmountRaw: string;
  quoteAmountDisplay: string;
  tokenAmountRaw: string;
  tokenAmountDisplay: string;
  executionPriceQuoteX18: string;
  executionPriceQuoteDisplay: string;
  /** Quote/USD snapshot used at trade time (x18). */
  quoteUsdX18: string | null;
  executionPriceUsdX18: string | null;
  executionPriceUsdDisplay: string | null;
  /** Trade USD notional (x18) — finished by indexer; do not recompute in UI. */
  usdValueX18: string | null;
  usdValueDisplay: string | null;
  isInitialBuy: boolean;
  confirmationStatus: ConfirmationStatus | string;
}

export interface HolderItem {
  chainId: number;
  tokenAddress: string;
  holderAddress: string;
  balanceRaw: string;
  balanceDisplay: string;
  /** floor(balance * 10000 / totalSupply) */
  percentOfSupplyBps: number;
  /** floor(balance * 1e18 / totalSupply) as decimal string */
  percentOfSupplyX18: string;
  holderClass: string;
  isSystemAddress: boolean;
  firstSeenBlock: number;
  lastUpdatedBlock: number;
}

export interface CandleItem {
  chainId: number;
  tokenAddress: string;
  poolId: string;
  interval: CandleInterval | string;
  bucketStart: number;
  openQuoteX18: string;
  highQuoteX18: string;
  lowQuoteX18: string;
  closeQuoteX18: string;
  openQuoteDisplay: string;
  highQuoteDisplay: string;
  lowQuoteDisplay: string;
  closeQuoteDisplay: string;
  quoteVolumeRaw: string;
  tokenVolumeRaw: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  openUsdX18: string | null;
  highUsdX18: string | null;
  lowUsdX18: string | null;
  closeUsdX18: string | null;
  usdVolumeX18: string | null;
}

export interface CreatorEarningsAsset {
  assetKind: string;
  assetAddress: string;
  claimableRaw: string;
  claimableDisplay: string;
  creditedRaw: string;
  claimedRaw: string;
  sourceBlock: number | null;
}

export interface CreatorEarningsSummary {
  chainId: number;
  creatorId: string;
  creatorType: string | null;
  walletAddress: string | null;
  isXClaimed: boolean | null;
  assets: CreatorEarningsAsset[];
  tokenCount: number;
}

export interface DiscoveryRankingItem {
  rank: number;
  type: RankingType;
  token: TokenDiscoveryItem;
  metricRaw: string | null;
  metricDisplay: string | null;
}

export interface IndexerStatus {
  chainId: number;
  heartbeatAt: string | null;
  latestIndexedBlock: number | null;
  chainLatest: number | null;
  chainSafe: number | null;
  chainFinalized: number | null;
  lagBlocks: number | null;
  lastRpcOkAt: string | null;
  reorgCount: number;
  dirtyProjections: boolean;
  watchlistSize: number;
  activeRpc: string | null;
  wsConnected: boolean;
  notes: string | null;
  healthy: boolean;
}

/** Product category for public quote catalogue (distinct from protocol quote_type). */
export type QuoteCategory = 'native' | 'stablecoin' | 'stock';

/** Row from `public_quote_catalogue` — product-safe fields only. */
export interface PublicQuoteCatalogueItem {
  chainId: number;
  quoteAsset: string;
  /** Protocol quote_type: native | scoop | stock */
  quoteType: string;
  symbol: string;
  displaySymbol: string;
  name: string;
  decimals: number;
  category: QuoteCategory;
  /** Nullable — ETH/USDG images pending approved assets; stocks use Robinhood CDN. */
  imageUrl: string | null;
  sourceName: string | null;
  sortOrder: number;
  isRegistered: boolean;
  isEnabled: boolean;
}
