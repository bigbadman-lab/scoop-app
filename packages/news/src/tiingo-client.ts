import type { TiingoNewsArticleRaw } from './types.js';

export const TIINGO_NEWS_ENDPOINT = 'https://api.tiingo.com/tiingo/news';
const FORBIDDEN_BULK = 'bulk_download';

export type TiingoFetchParams = {
  limit?: number;
  offset?: number;
  sortBy?: 'crawlDate' | 'publishedDate';
  tickers?: string;
  tags?: string;
  onlyWithTickers?: boolean;
  source?: string;
  startDate?: string;
  endDate?: string;
};

export type TiingoClientOptions = {
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export class TiingoNewsError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'TiingoNewsError';
    this.status = status;
    this.retryable = retryable;
  }
}

/** Strip secrets / connection strings from error text for logs & checkpoint. */
export function sanitizeErrorMessage(message: string, token?: string): string {
  let out = message;
  if (token && token.length > 0) {
    out = out.split(token).join('[REDACTED]');
  }
  out = out.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***');
  out = out.replace(/Authorization:\s*Token\s+\S+/gi, 'Authorization: Token [REDACTED]');
  if (out.length > 500) out = `${out.slice(0, 497)}...`;
  return out;
}

function assertNotBulk(url: string): void {
  if (url.includes(FORBIDDEN_BULK)) {
    throw new TiingoNewsError('Refusing to call Tiingo bulk_download endpoint', null, false);
  }
}

function buildUrl(params: TiingoFetchParams): string {
  const url = new URL(TIINGO_NEWS_ENDPOINT);
  assertNotBulk(url.toString());
  url.searchParams.set('sortBy', params.sortBy ?? 'crawlDate');
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) url.searchParams.set('offset', String(params.offset));
  if (params.tickers) url.searchParams.set('tickers', params.tickers);
  if (params.tags) url.searchParams.set('tags', params.tags);
  if (params.onlyWithTickers) url.searchParams.set('onlyWithTickers', 'true');
  if (params.source) url.searchParams.set('source', params.source);
  if (params.startDate) url.searchParams.set('startDate', params.startDate);
  if (params.endDate) url.searchParams.set('endDate', params.endDate);
  assertNotBulk(url.toString());
  return url.toString();
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTiingoNewsClient(options: TiingoClientOptions) {
  const {
    token,
    timeoutMs = 15_000,
    maxRetries = 3,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options;

  if (!token.trim()) {
    throw new Error('Tiingo token is required');
  }

  async function fetchNews(params: TiingoFetchParams = {}): Promise<TiingoNewsArticleRaw[]> {
    const url = buildUrl(params);
    let lastError: TiingoNewsError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: `Token ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (res.status === 200) {
          const body: unknown = await res.json();
          if (!Array.isArray(body)) {
            throw new TiingoNewsError('Tiingo news response was not an array', 200, false);
          }
          return body as TiingoNewsArticleRaw[];
        }

        const retryable = res.status === 429 || res.status >= 500;
        const err = new TiingoNewsError(
          `Tiingo news request failed with status ${res.status}`,
          res.status,
          retryable,
        );
        if (!retryable || attempt === maxRetries) throw err;
        lastError = err;
        await sleep(250 * 2 ** attempt);
      } catch (error) {
        if (error instanceof TiingoNewsError) {
          if (!error.retryable || attempt === maxRetries) throw error;
          lastError = error;
          await sleep(250 * 2 ** attempt);
          continue;
        }

        const aborted =
          error instanceof Error &&
          (error.name === 'AbortError' || /aborted/i.test(error.message));
        const msg = aborted
          ? `Tiingo news request timed out after ${timeoutMs}ms`
          : sanitizeErrorMessage(
              error instanceof Error ? error.message : String(error),
              token,
            );
        const err = new TiingoNewsError(msg, null, true);
        if (attempt === maxRetries) throw err;
        lastError = err;
        await sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new TiingoNewsError('Tiingo news request failed', null, true);
  }

  return { fetchNews, endpoint: TIINGO_NEWS_ENDPOINT };
}

export type TiingoNewsClient = ReturnType<typeof createTiingoNewsClient>;
