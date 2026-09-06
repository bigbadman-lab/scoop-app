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

export type GetLatestNewsOptions = {
  limit?: number;
  ticker?: string;
  onlyWithTickers?: boolean;
  excludeBackfill?: boolean;
  provider?: string;
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
