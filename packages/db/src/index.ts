export { createPool, createClient, withTransaction, createDbClient, query } from './client.js';
export { normalizeAddress, normalizeBytes32, toNumericString } from './hex.js';
export {
  formatRawAmount,
  formatX18,
  fracDigitsForSignificant,
  percentOfSupplyBps,
  percentOfSupplyX18,
  clampLimit,
  clampOffset,
} from './decimal.js';
export {
  DEFAULT_NEW_WINDOW_SECONDS,
  DEFAULT_SOON_THRESHOLD_BPS,
  NEW_MARKET_WINDOW_SECONDS,
} from './queries/_discoverySql.js';
export type {
  DiscoveryFilter,
  DiscoverySort,
  RankingType,
  CandleInterval,
  TradeSide,
  ConfirmationStatus,
  TokenDiscoveryItem,
  TokenDetail,
  TradeItem,
  HolderItem,
  CandleItem,
  CreatorEarningsAsset,
  CreatorEarningsSummary,
  DiscoveryRankingItem,
  IndexerStatus,
  QuoteCategory,
  PublicQuoteCatalogueItem,
} from './dto.js';
export {
  getTokens,
  getToken,
  getActiveMarkets,
  getDiscoverBoard,
  getDiscoverTrending,
  getDiscoverBonding,
  DISCOVER_TAB_LIMIT,
  DISCOVER_TRENDING_MIN_TRADES_24H,
  getLaunchMarketReady,
  getTrades,
  getHolders,
  getCandles,
  assertCandleInterval,
  getCreatorEarnings,
  getScoopAccountBundle,
  getScoopProfile,
  updateScoopDisplayName,
  updateScoopAvatarPath,
  listLaunchesForScoopUser,
  getDeployerFeeTotalsForScoopUser,
  getCreatorFeeTotalsForScoopUser,
  getRankings,
  assertRankingType,
  getIndexerStatus,
  getNewsArticleMarketsForArticles,
  listNewsArticleMarkets,
  getPublicQuoteCatalogue,
  CANONICAL_QUOTE_CATALOGUE_COUNT,
  SCOOP_CHAIN_ID,
  listFeeKeeperMarkets,
  feeKeeperMarketsSqlForMode,
  historicalFeeKeeperSqlReferencesP5Columns,
  listHolderRewardVaultMarkets,
  listTokenTransfersThroughBlock,
  resolveSnapshotBlockForHourEnd,
  getIndexerMainCheckpointBlock,
  listDepositAssetsForVault,
  getWorkerRound,
  upsertWorkerRoundComputed,
  replaceWorkerEntitlements,
  upsertWorkerRoundStatus,
  markWorkerRoundPublished,
  listWorkerEntitlements,
  updateEntitlementPushStatus,
  getEarliestVaultDepositUnix,
  listHolderRewardEntitlementsForAccount,
  parseHolderRewardProofJson,
  type GetTokensOptions,
  type GetActiveMarketsOptions,
  type GetDiscoverBoardOptions,
  type DiscoverBoardRows,
  type GetTradesOptions,
  type GetHoldersOptions,
  type GetCandlesOptions,
  type GetRankingsOptions,
  type GetPublicQuoteCatalogueOptions,
  type ScoopAccountBundle,
  type ScoopAccountLaunch,
  type ScoopFeeAssetLine,
  type ScoopDeployerFeeBreakdownLine,
  type ScoopProfileRecord,
  type ScoopAccountWallet,
  type NewsArticleMarketSummary,
  type NewsArticleMarketBundle,
  type LaunchMarketReady,
  type FeeKeeperMarket,
  type FeeKeeperDiscoveryMode,
  type HolderRewardsVaultMarket,
  type TransferThroughBlock,
  type SnapshotBlockCandidate,
  type WorkerRoundStatus,
  type WorkerRoundRow,
  type WorkerEntitlementRow,
  type HolderRewardAccountEntitlement,
} from './queries/index.js';
export type {
  DatabaseClientMode,
  ScoopDbClient,
  ScoopDbConfig,
  Queryable,
  Pool,
  PoolClient,
  Client,
} from './types.js';
export { upsertRawChainEvent, type RawChainEventRow } from './repos/raw-chain-events.js';
export {
  upsertLaunch,
  upsertLaunchEconomics,
  type LaunchRow,
  type CreatorAllocationDestinationOrdinal,
  type AdditionalFeeDestinationOrdinal,
} from './repos/launches.js';
export {
  upsertHolderRewardDeposit,
  upsertHolderRewardRound,
  upsertHolderRewardPayout,
  recomputeHolderRewardRoundTotals,
  listPositiveHolderBalances,
  type HolderRewardDepositRow,
  type HolderRewardRoundRow,
  type HolderRewardPayoutRow,
  type HolderRewardPayoutType,
  type HolderRewardPayoutStatus,
  type PositiveHolderBalanceRow,
} from './repos/holder-rewards.js';
export {
  linkNewsArticleMarket,
  resolveArticleFromDraft,
  type NewsArticleMarketLink,
} from './repos/news-article-markets.js';
export { upsertToken, setTokenDisplayImageUrl, applyDraftDisplayImageToToken, applyDisplayImagePathToToken, type TokenRow } from './repos/tokens.js';
export { upsertCreator, type CreatorRow } from './repos/creators.js';
export { upsertPool, type PoolRow } from './repos/pools.js';
export { upsertTrade, type TradeRow } from './repos/trades.js';
export { upsertTransfer, type TransferRow } from './repos/transfers.js';
export {
  upsertHolderBalance,
  deleteHolderBalance,
  type HolderBalanceRow,
} from './repos/holder-balances.js';
export {
  upsertTokenMarketState,
  listMarketsForQuoteUsdRevaluation,
  updateTokenMarketUsdValuation,
  type TokenMarketStateRow,
  type QuoteMarketRevaluationRow,
} from './repos/token-market-state.js';
export { upsertCandle, type CandleRow } from './repos/candles.js';
export {
  upsertIndexerCheckpoint,
  getIndexerCheckpoint,
  type IndexerCheckpointRow,
} from './repos/indexer-checkpoints.js';
export {
  upsertIndexerHealth,
  getIndexerHealth,
  type IndexerHealthRow,
} from './repos/indexer-health.js';
export {
  upsertAddressClassification,
  type AddressClassificationRow,
} from './repos/address-classifications.js';
export {
  resolveOrCreateScoopUserForVerifiedWallet,
  findScoopUserByWalletAddress,
  type ScoopUserRecord,
  type ScoopUserStatus,
  type ScoopWalletType,
  type ScoopWalletProvider,
  type ResolveScoopUserInput,
} from './repos/scoop-identity.js';
export {
  upsertProcessedBlock,
  getProcessedBlock,
  deleteProcessedBlocksFrom,
  listProcessedBlocksInWindow,
  type ProcessedBlockRow,
} from './repos/processed-blocks.js';
export {
  queryDiscoveryAll,
  queryDiscoveryNew,
  queryDiscoverySoon,
  queryDiscoveryBonded,
  type DiscoveryLaunchRow,
} from './repos/discovery.js';
export {
  upsertFeeDistribution,
  upsertCreatorCredit,
  upsertCreatorClaim,
  upsertCreatorClaimable,
  insertQuotePriceSnapshot,
  getLatestQuotePriceUsd,
  getQuotePriceUsdAtOrBefore,
  listSnapshotEligibleQuoteAssets,
  getQuoteAssetDecimals,
  type FeeDistributionRow,
  type CreatorCreditRow,
  type CreatorClaimRow,
  type CreatorClaimableRow,
  type QuotePriceSnapshotRow,
  type LatestQuotePriceRow,
} from './repos/creator-economics.js';
