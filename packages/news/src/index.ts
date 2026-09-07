export type {
  TiingoNewsArticleRaw,
  ProviderNewsArticle,
  NewsFeedItem,
  NewsFeedCursor,
  GetLatestNewsOptions,
  NewsIngestionCheckpoint,
  NewsIngestResult,
} from './types.js';

export {
  TIINGO_PROVIDER,
  DEFAULT_BACKFILL_LAG_SECONDS,
  normalizeNewsDomain,
  normalizeProviderTickers,
  normalizeProviderTags,
  parseTiingoDate,
  computeCrawlPublishLagSeconds,
  isBackfillCandidate,
  computeContentHash,
  canonicalizeUrl,
  normalizeTiingoArticle,
} from './normalize.js';

export {
  TIINGO_NEWS_ENDPOINT,
  TiingoNewsError,
  createTiingoNewsClient,
  sanitizeErrorMessage,
} from './tiingo-client.js';

export { isNewsPublicDisplayEnabled, assertNewsPublicDisplayAllowed } from './gate.js';
export { loadNewsConfig } from './config.js';
export { getLatestNews } from './query.js';
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
  type ImageModelCaller,
} from './ai/index.js';

export {
  createNewsLaunchDraft,
  getLaunchDraft,
  generateDraftArtwork,
  selectDraftArtwork,
  updateLaunchDraft,
  type DraftServiceDeps,
} from './drafts/service.js';

export {
  ingestOnce,
  catchupNews,
  selectCatchupPage,
  normalizeBatch,
  createDefaultTiingoClient,
} from './ingest.js';

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
} from './repos/articles.js';
