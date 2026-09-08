/** Stock News API article row from GET /api/v1 */
export type StockNewsArticleRaw = {
  news_url?: string | null;
  image_url?: string | null;
  title?: string | null;
  text?: string | null;
  source_name?: string | null;
  date?: string | null;
  topics?: string[] | null;
  sentiment?: string | null;
  type?: string | null;
  tickers?: string[] | null;
  news_id?: string | number | null;
  newsid?: string | number | null;
  rank_score?: number | null;
};

/** Canonical shape for provider_news_articles upsert. */
export type ProviderNewsArticle = {
  provider: 'stocknewsapi';
  providerArticleId: string;
  title: string;
  description: string | null;
  sourceDomain: string;
  url: string;
  canonicalUrl: string | null;
  imageUrl: string | null;
  providerPublishedAt: Date;
  providerCrawledAt: Date;
  providerTickers: string[];
  providerTags: string[];
  crawlPublishLagSeconds: number | null;
  isBackfillCandidate: boolean;
  contentHash: string | null;
  marketRelevanceScore?: number | null;
  relevanceClass?: string | null;
  relevanceReasons?: string[];
};

export type NewsFeedItem = {
  providerArticleId: string;
  headline: string;
  description: string | null;
  sourceDomain: string;
  url: string;
  publishedAt: string;
  crawledAt: string;
  tickers: string[];
  tags: string[];
  isBackfillCandidate: boolean;
  imageUrl?: string | null;
};

/** Keyset cursor for newest-first pagination. */
export type NewsFeedCursor = {
  at: string;
  providerArticleId: string;
};

export type GetLatestNewsOptions = {
  limit?: number;
  ticker?: string;
  onlyWithTickers?: boolean;
  stockRelevantOnly?: boolean;
  excludeBackfill?: boolean;
  provider?: string;
  orderBy?: 'crawled' | 'published';
  cursor?: NewsFeedCursor;
};

export type NewsIngestionCheckpoint = {
  provider: string;
  lastCrawlDate: Date | null;
  lastProviderArticleId: string | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

export type NewsIngestResult = {
  fetched: number;
  accepted: number;
  rejected: number;
  upserted: number;
  newestCrawlDate: string | null;
  checkpointAdvanced: boolean;
  pages: number;
  stoppedReason: 'complete' | 'max_pages' | 'watermark' | 'empty' | 'error';
  error?: string;
  rejectReasonCounts?: Record<string, number>;
  /** D.2 Stock News API run stats */
  topMentions?: number;
  equitiesRetained?: number;
  nonEquitiesRemoved?: number;
  articleCalls?: number;
  deduped?: number;
  dateWindow?: string;
  universeSource?: 'top_mention' | 'curated_seed';
};
