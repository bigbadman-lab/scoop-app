/** Tiingo raw article from GET https://api.tiingo.com/tiingo/news */
export type TiingoNewsArticleRaw = {
  id: number | string;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  publishedDate?: string | null;
  crawlDate?: string | null;
  source?: string | null;
  tickers?: string[] | null;
  tags?: string[] | null;
};

/** Canonical shape for provider_news_articles upsert. */
export type ProviderNewsArticle = {
  provider: 'tiingo';
  providerArticleId: string;
  title: string;
  description: string | null;
  sourceDomain: string;
  url: string;
  canonicalUrl: string | null;
  providerPublishedAt: Date;
  providerCrawledAt: Date;
  providerTickers: string[];
  providerTags: string[];
  crawlPublishLagSeconds: number | null;
  isBackfillCandidate: boolean;
  contentHash: string | null;
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
};

/** Keyset cursor for newest-first pagination. */
export type NewsFeedCursor = {
  /** ISO timestamp of the sort column on the last seen row. */
  at: string;
  providerArticleId: string;
};

export type GetLatestNewsOptions = {
  limit?: number;
  ticker?: string;
  onlyWithTickers?: boolean;
  excludeBackfill?: boolean;
  provider?: string;
  /**
   * Sort key for newest-first feed.
   * - `crawled` (default): ingestion/recency watermark order
   * - `published`: authoritative publication time (preferred for public UI)
   */
  orderBy?: 'crawled' | 'published';
  /** Exclusive keyset cursor — returns rows strictly older than this position. */
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
  upserted: number;
  newestCrawlDate: string | null;
  checkpointAdvanced: boolean;
  pages: number;
  stoppedReason: 'complete' | 'max_pages' | 'watermark' | 'empty' | 'error';
  error?: string;
};
