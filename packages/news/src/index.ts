export type {
  StockNewsArticleRaw,
  ProviderNewsArticle,
  NewsFeedItem,
  NewsFeedCursor,
  GetLatestNewsOptions,
  NewsIngestionCheckpoint,
  NewsIngestResult,
} from './types.js';

export {
  STOCKNEWS_PROVIDER,
  TIINGO_PROVIDER,
  DEFAULT_BACKFILL_LAG_SECONDS,
  normalizeNewsDomain,
  normalizeProviderTickers,
  normalizeProviderTags,
  parseProviderDate,
  parseTiingoDate,
  computeCrawlPublishLagSeconds,
  isBackfillCandidate,
  computeContentHash,
  canonicalizeUrl,
  stockNewsArticleId,
  normalizeStockNewsArticle,
} from './normalize.js';

export {
  STOCK_NEWS_API_BASE,
  StockNewsApiError,
  createStockNewsClient,
  sanitizeErrorMessage,
} from './stocknews-client.js';

export {
  classifyMentionInstrument,
  filterEquityMentions,
  curatedEquityMentions,
  CURATED_EQUITY_SEED,
} from './instruments.js';

export { isNewsPublicDisplayEnabled, isMarketsNewsWriteEnabled, assertNewsPublicDisplayAllowed } from './gate.js';
export { loadNewsConfig } from './config.js';
export { getLatestNews, STOCKS_PUBLIC_QUALITY_SQL } from './query.js';
export {
  evaluateScoopNewsRelevance,
  filterEquityTickers,
  type ScoopNewsRelevance,
  type ScoopNewsRelevanceClass,
} from './relevance.js';
export { partitionByScoopRelevance, attachRelevance } from './relevance-partition.js';

export {
  NEWS_FEED_CATEGORIES,
  isNewsFeedCategory,
  parseNewsFeedCategory,
  checkpointProviderForCategory,
  STOCKS_CHECKPOINT_PROVIDER,
  MARKETS_CHECKPOINT_PROVIDER,
  type NewsFeedCategory,
  type ParseNewsFeedCategoryResult,
} from './feed-category.js';

export {
  addFeedCategory,
  mergeFeedCategories,
} from './feed-membership.js';

export {
  MARKETS_MAX_ARTICLE_AGE_MS,
  isWithinMarketsAgeWindow,
  marketsArticleAgeMs,
} from './markets-freshness.js';

export {
  evaluateMarketsNewsRelevance,
  looksLikeSingleNameContamination,
  hasSingleNameTitleShape,
  type MarketsRelevance,
  type MarketsRelevanceClass,
} from './markets-relevance.js';

export {
  runMarketsDryRun,
  formatMarketsDryRunReport,
  type MarketsDryRunDeps,
  type MarketsDryRunResult,
  type MarketsDryRunArticleView,
  type MarketsOverlapLookup,
} from './markets-dry-run.js';

export {
  ingestMarketsOnce,
  fetchMarketsRawArticles,
  formatMarketsProductionSimulation,
  MARKETS_ITEMS_PER_PAGE,
  MARKETS_MAX_PAGES,
  type MarketsIngestDeps,
  type MarketsIngestResult,
} from './markets-ingest.js';
export { getEnabledQuoteAssets } from './repos/quotes.js';
export { getNewsArticleForConcepts } from './repos/article.js';

export {
  generateLaunchConcepts,
  createResponsesModelCaller,
  ConceptValidationError,
  validateAndNormalizeConcepts,
  revalidateLaunchConcept,
  validateDraftTextFields,
  isEnabledPairAddress,
  loadOpenAiConceptConfig,
  DEFAULT_OPENAI_CONCEPT_MODEL,
  CONCEPT_SYSTEM_PROMPT,
  buildConceptUserPrompt,
  LaunchConceptsModelSchema,
  generateTokenArtworkOptions,
  buildArtworkStoragePath,
  sanitizePathSegment,
  isUuid,
  IMAGE_SYSTEM_CONSTRAINTS,
  buildTokenArtworkPrompt,
  assertSafeImagePrompt,
  DEFAULT_OPENAI_IMAGE_MODEL,
  createSupabaseDraftAssetStorage,
  TOKEN_IMAGE_BUCKET,
  buildTokenDisplayImagePath,
  buildManualTokenDisplayImagePath,
  isAllowedTokenDisplayImagePath,
  deriveTokenImagePublicUrl,
  validateTokenDisplayImage,
  createSupabaseTokenImageStorage,
  persistSelectedArtworkDisplayCopy,
  type EnabledQuoteAsset,
  type LaunchConcept,
  type LaunchConceptResponse,
  type GenerateLaunchConceptsInput,
  type GenerateLaunchConceptsResult,
  type ConceptArticleContext,
  type ConceptModelCaller,
  type GenerateLaunchConceptsDeps,
  type LaunchDraft,
  type TokenArtworkOption,
  type CreateNewsLaunchDraftInput,
  type UpdateLaunchDraftPatch,
  type DraftAssetStorage,
  type TokenImageStorage,
  type ImageModelCaller,
} from './ai/index.js';

export {
  createNewsLaunchDraft,
  getLaunchDraft,
  generateDraftArtwork,
  generateSingleDraftArtwork,
  markDraftArtworkPending,
  getDraftArtworkStatus,
  selectDraftArtwork,
  updateLaunchDraft,
  type DraftServiceDeps,
  type ArtworkStatus,
  type DraftArtworkStatusView,
} from './drafts/service.js';

export {
  ingestOnce,
  catchupNews,
  selectCatchupPage,
  normalizeBatch,
  normalizeBatchDetailed,
  createDefaultStockNewsClient,
} from './ingest.js';

export {
  tryAcquireNewsIngestLock,
  NEWS_INGEST_ADVISORY_LOCK_SQL,
  isForeignWorkerLockSql,
} from './lock.js';

export {
  getNewsCheckpoint,
  ensureNewsCheckpoint,
  markNewsAttempt,
  advanceNewsCheckpoint,
} from './repos/checkpoints.js';

export {
  upsertProviderNewsArticles,
  countProviderNewsArticles,
  countDuplicateProviderKeys,
  getNewsSmokeStats,
  type UpsertNewsStats,
  type NewsSmokeStats,
} from './repos/articles.js';
