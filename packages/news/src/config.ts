/** News package config from env. Never logs secrets. */

export type NewsConfig = {
  stockNewsApiToken: string;
  databaseUrl: string;
  itemsPerCall: number;
  batchSize: number;
  dateWindow: string;
  fallbackDateWindow: string;
  backfillLagSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  maxAgeHoursWithoutDate: number;
  publicDisplayEnabled: boolean;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

export function loadNewsConfig(env: NodeJS.ProcessEnv = process.env): NewsConfig {
  const stockNewsApiToken = (env.STOCK_NEWS_API_TOKEN ?? '').trim();
  if (!stockNewsApiToken) {
    throw new Error('STOCK_NEWS_API_TOKEN is required');
  }

  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const publicRaw = (env.SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED ?? 'false').trim().toLowerCase();

  return {
    stockNewsApiToken,
    databaseUrl,
    // Paid plans support up to 100; trial auto-falls back to 3 inside ingest.
    itemsPerCall: parsePositiveInt(env.STOCK_NEWS_ITEMS_PER_CALL, 50),
    batchSize: parsePositiveInt(env.STOCK_NEWS_BATCH_SIZE, 8),
    dateWindow: (env.STOCK_NEWS_TOP_MENTION_DATE ?? 'today').trim() || 'today',
    fallbackDateWindow: (env.STOCK_NEWS_FALLBACK_DATE ?? 'last7days').trim() || 'last7days',
    backfillLagSeconds: parsePositiveInt(env.STOCK_NEWS_BACKFILL_LAG_SECONDS, 21_600),
    requestTimeoutMs: parsePositiveInt(env.STOCK_NEWS_REQUEST_TIMEOUT_MS, 15_000),
    maxRetries: parsePositiveInt(env.STOCK_NEWS_MAX_RETRIES, 3),
    maxAgeHoursWithoutDate: parsePositiveInt(env.STOCK_NEWS_MAX_AGE_HOURS, 48),
    publicDisplayEnabled: publicRaw === 'true' || publicRaw === '1' || publicRaw === 'yes',
  };
}
