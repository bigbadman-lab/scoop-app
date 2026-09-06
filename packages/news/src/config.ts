/** News package config from env. Never logs secrets. */

export type NewsConfig = {
  tiingoApiToken: string;
  databaseUrl: string;
  newsLimit: number;
  newsMaxPages: number;
  backfillLagSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  publicDisplayEnabled: boolean;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

export function loadNewsConfig(env: NodeJS.ProcessEnv = process.env): NewsConfig {
  const tiingoApiToken = (env.TIINGO_API_TOKEN ?? '').trim();
  if (!tiingoApiToken) {
    throw new Error('TIINGO_API_TOKEN is required');
  }

  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const publicRaw = (env.SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED ?? 'false').trim().toLowerCase();

  return {
    tiingoApiToken,
    databaseUrl,
    newsLimit: parsePositiveInt(env.TIINGO_NEWS_LIMIT, 100),
    newsMaxPages: parsePositiveInt(env.TIINGO_NEWS_MAX_PAGES, 10),
    backfillLagSeconds: parsePositiveInt(env.TIINGO_BACKFILL_LAG_SECONDS, 21_600),
    requestTimeoutMs: parsePositiveInt(env.TIINGO_REQUEST_TIMEOUT_MS, 15_000),
    maxRetries: parsePositiveInt(env.TIINGO_MAX_RETRIES, 3),
    publicDisplayEnabled: publicRaw === 'true' || publicRaw === '1' || publicRaw === 'yes',
  };
}
