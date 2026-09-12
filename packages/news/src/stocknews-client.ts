import type { StockNewsArticleRaw } from './types.js';

export const STOCK_NEWS_API_BASE = 'https://stocknewsapi.com/api/v1';

export type StockNewsClientOptions = {
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export class StockNewsApiError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'StockNewsApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function sanitizeErrorMessage(message: string, token?: string): string {
  let out = message;
  if (token) {
    out = out.split(token).join('[REDACTED]');
  }
  return out
    .replace(/token=[^&\s"']+/gi, 'token=[REDACTED]')
    .replace(/`[^`]{16,}`/g, '`[REDACTED]`')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://***');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type TopMentionParams = {
  date: string;
};

export type TickerNewsParams = {
  tickers: string[];
  items: number;
  page?: number;
  type?: 'article' | 'video';
  date?: string;
  sortby?: 'rank' | 'date';
  days?: number;
};

/** Category / general market news (`GET /api/v1/category`). */
export type CategoryNewsParams = {
  /** Provider section — Markets uses `general`. */
  section: 'general' | 'alltickers';
  items: number;
  page?: number;
  type?: 'article' | 'video';
  /** Often plan-blocked on category; omit unless known-allowed. */
  date?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** Request news_id / rank_score when supported. */
  extraFields?: string;
};

export type TopMentionRow = {
  ticker: string;
  name: string | null;
  totalMentions: number | null;
  positiveMentions: number | null;
  negativeMentions: number | null;
  neutralMentions: number | null;
  sentimentScore: number | null;
};

function buildUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${STOCK_NEWS_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== '') url.searchParams.set(k, v);
  }
  return url;
}

export function createStockNewsClient(options: StockNewsClientOptions) {
  const token = options.token.trim();
  if (!token) throw new Error('STOCK_NEWS_API_TOKEN is required');
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  async function requestJson(url: URL): Promise<unknown> {
    // Never log url with token — callers must not print searchParams.
    url.searchParams.set('token', token);
    let lastError: StockNewsApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const body = (await res.json().catch(() => null)) as
          | { message?: string; data?: unknown }
          | unknown[]
          | null;

        if (res.ok) return body;

        const rawMsg =
          body && typeof body === 'object' && !Array.isArray(body) && 'message' in body
            ? String((body as { message?: string }).message ?? res.statusText)
            : res.statusText;
        const msg = sanitizeErrorMessage(rawMsg, token);
        const retryable = res.status === 429 || res.status >= 500;
        const err = new StockNewsApiError(
          `Stock News API request failed (${res.status}): ${msg}`,
          res.status,
          retryable,
        );
        lastError = err;
        if (!retryable || attempt === maxRetries) throw err;
        await sleep(250 * (attempt + 1));
      } catch (error) {
        if (error instanceof StockNewsApiError) {
          if (!error.retryable || attempt === maxRetries) throw error;
          lastError = error;
          await sleep(250 * (attempt + 1));
          continue;
        }
        const aborted = error instanceof Error && error.name === 'AbortError';
        const msg = sanitizeErrorMessage(
          aborted
            ? `Stock News API request timed out after ${timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error),
          token,
        );
        const err = new StockNewsApiError(msg, null, true);
        lastError = err;
        if (attempt === maxRetries) throw err;
        await sleep(250 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new StockNewsApiError('Stock News API request failed', null, true);
  }

  async function fetchTopMentions(params: TopMentionParams): Promise<TopMentionRow[]> {
    const url = buildUrl('/top-mention', { date: params.date });
    const body = await requestJson(url);
    const rows = Array.isArray((body as { data?: { all?: unknown } })?.data?.all)
      ? ((body as { data: { all: unknown[] } }).data.all as Record<string, unknown>[])
      : Array.isArray((body as { data?: unknown })?.data)
        ? ((body as { data: unknown[] }).data as Record<string, unknown>[])
        : [];

    return rows
      .map((row) => ({
        ticker: String(row.ticker ?? '')
          .trim()
          .toUpperCase(),
        name: row.name == null ? null : String(row.name),
        totalMentions:
          row.total_mentions == null ? null : Number(row.total_mentions),
        positiveMentions:
          row.positive_mentions == null ? null : Number(row.positive_mentions),
        negativeMentions:
          row.negative_mentions == null ? null : Number(row.negative_mentions),
        neutralMentions:
          row.neutral_mentions == null ? null : Number(row.neutral_mentions),
        sentimentScore:
          row.sentiment_score == null ? null : Number(row.sentiment_score),
      }))
      .filter((r) => Boolean(r.ticker));
  }

  async function fetchTickerNews(params: TickerNewsParams): Promise<StockNewsArticleRaw[]> {
    if (params.tickers.length === 0) return [];
    const query: Record<string, string> = {
      tickers: params.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean).join(','),
      items: String(Math.min(Math.max(params.items, 1), 100)),
      page: String(params.page ?? 1),
      type: params.type ?? 'article',
    };
    if (params.date) query.date = params.date;
    if (params.sortby) query.sortby = params.sortby;
    if (params.days != null) query.days = String(params.days);

    const url = buildUrl('', query);
    // buildUrl with path '' → .../api/v1? — need path without extra slash issues
    // STOCK_NEWS_API_BASE is .../api/v1, path '' gives .../api/v1?tickers=
    const body = await requestJson(url);
    const rows = Array.isArray((body as { data?: unknown })?.data)
      ? ((body as { data: unknown[] }).data as StockNewsArticleRaw[])
      : Array.isArray(body)
        ? (body as StockNewsArticleRaw[])
        : [];
    return rows;
  }

  /**
   * Markets stream: general market news (not ticker-universe constrained).
   * Persistence is intentionally outside this helper — fetch only.
   */
  async function fetchCategoryNews(params: CategoryNewsParams): Promise<{
    articles: StockNewsArticleRaw[];
    totalPages: number | null;
    totalItems: number | null;
  }> {
    const query: Record<string, string> = {
      section: params.section,
      items: String(Math.min(Math.max(params.items, 1), 100)),
      page: String(params.page ?? 1),
      type: params.type ?? 'article',
    };
    if (params.date) query.date = params.date;
    if (params.sentiment) query.sentiment = params.sentiment;
    if (params.extraFields) query['extra-fields'] = params.extraFields;

    const url = buildUrl('/category', query);
    const body = await requestJson(url);
    const rows = Array.isArray((body as { data?: unknown })?.data)
      ? ((body as { data: unknown[] }).data as StockNewsArticleRaw[])
      : Array.isArray(body)
        ? (body as StockNewsArticleRaw[])
        : [];
    const totalPagesRaw = (body as { total_pages?: unknown })?.total_pages;
    const totalItemsRaw = (body as { total_items?: unknown })?.total_items;
    return {
      articles: rows,
      totalPages:
        typeof totalPagesRaw === 'number' && Number.isFinite(totalPagesRaw)
          ? totalPagesRaw
          : null,
      totalItems:
        typeof totalItemsRaw === 'number' && Number.isFinite(totalItemsRaw)
          ? totalItemsRaw
          : null,
    };
  }

  return {
    fetchTopMentions,
    fetchTickerNews,
    fetchCategoryNews,
    endpoint: STOCK_NEWS_API_BASE,
  };
}

export type StockNewsClient = ReturnType<typeof createStockNewsClient>;
