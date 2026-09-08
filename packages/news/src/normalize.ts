import { createHash } from 'node:crypto';
import type { ProviderNewsArticle, StockNewsArticleRaw } from './types.js';

export const STOCKNEWS_PROVIDER = 'stocknewsapi' as const;

/** @deprecated Use STOCKNEWS_PROVIDER — retained alias during D.2 cutover. */
export const TIINGO_PROVIDER = STOCKNEWS_PROVIDER;

export const DEFAULT_BACKFILL_LAG_SECONDS = 21_600;

export function normalizeNewsDomain(sourceOrUrl: string): string {
  let s = sourceOrUrl.trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const slash = s.indexOf('/');
  if (slash >= 0) s = s.slice(0, slash);
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  const at = s.lastIndexOf('@');
  if (at >= 0) s = s.slice(at + 1);
  const colon = s.indexOf(':');
  if (colon >= 0) s = s.slice(0, colon);
  if (s.startsWith('www.')) s = s.slice(4);
  return s;
}

export function normalizeProviderTickers(tickers: string[] | null | undefined): string[] {
  if (!tickers?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tickers) {
    const t = String(raw).trim().toUpperCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function normalizeProviderTags(tags: string[] | null | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw).trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Stock News API dates are Eastern Time strings, e.g.
 * `Tue, 08 Sep 2026 10:25:05 -0400`
 */
export function parseProviderDate(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @deprecated alias */
export function parseTiingoDate(value: string | null | undefined): Date | null {
  return parseProviderDate(value);
}

export function computeCrawlPublishLagSeconds(crawledAt: Date, publishedAt: Date): number {
  return Math.floor((crawledAt.getTime() - publishedAt.getTime()) / 1000);
}

export function isBackfillCandidate(
  lagSeconds: number | null,
  thresholdSeconds: number = DEFAULT_BACKFILL_LAG_SECONDS,
): boolean {
  if (lagSeconds === null) return false;
  return lagSeconds >= thresholdSeconds;
}

export function computeContentHash(input: {
  title: string;
  url: string;
  description: string | null;
}): string {
  const payload = `${input.title}\n${input.url}\n${input.description ?? ''}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function canonicalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const drop = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
    ];
    let changed = false;
    for (const key of drop) {
      if (u.searchParams.has(key)) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Stable ID: prefer provider news id; else sha256 of canonical/news URL. */
export function stockNewsArticleId(raw: StockNewsArticleRaw): string {
  const newsId = raw.news_id ?? raw.newsid;
  if (newsId != null && String(newsId).trim()) {
    return `sna_${String(newsId).trim()}`;
  }
  const url = String(raw.news_url ?? '').trim();
  if (!url) throw new Error('Stock News API article missing news_url and news_id');
  const canon = canonicalizeUrl(url) ?? url;
  const hash = createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 24);
  return `sna_url_${hash}`;
}

export type NormalizeOptions = {
  backfillLagSeconds?: number;
  ingestedAt?: Date;
};

export function normalizeStockNewsArticle(
  raw: StockNewsArticleRaw,
  options: NormalizeOptions = {},
): ProviderNewsArticle {
  const backfillLagSeconds = options.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;
  const ingestedAt = options.ingestedAt ?? new Date();

  const title = String(raw.title ?? '').trim();
  if (!title) throw new Error('Stock News API article missing title');

  const url = String(raw.news_url ?? '').trim();
  if (!url) throw new Error('Stock News API article missing news_url');

  const publishedAt = parseProviderDate(raw.date);
  if (!publishedAt) throw new Error('Stock News API article missing/invalid date');

  const descRaw = raw.text == null ? null : String(raw.text).trim();
  const description = descRaw && descRaw.length > 0 ? descRaw : null;

  const sourceRaw = String(raw.source_name ?? '').trim();
  let sourceDomain = normalizeNewsDomain(sourceRaw);
  // Provider source_name is often a display title ("24/7 Wall Street"), not a host.
  if (!sourceDomain.includes('.') || sourceDomain.length < 4) {
    sourceDomain = normalizeNewsDomain(url) || sourceDomain || 'unknown';
  }
  if (!sourceDomain) sourceDomain = 'unknown';

  const imageRaw = raw.image_url == null ? null : String(raw.image_url).trim();
  const imageUrl = imageRaw && imageRaw.length > 0 ? imageRaw : null;

  const topics = normalizeProviderTags(raw.topics ?? undefined);
  const sentiment = raw.sentiment ? [String(raw.sentiment).trim().toLowerCase()] : [];
  const tags = [...new Set([...topics, ...sentiment])];

  const lag = computeCrawlPublishLagSeconds(ingestedAt, publishedAt);

  return {
    provider: STOCKNEWS_PROVIDER,
    providerArticleId: stockNewsArticleId(raw),
    title,
    description,
    sourceDomain,
    url,
    canonicalUrl: canonicalizeUrl(url),
    imageUrl,
    providerPublishedAt: publishedAt,
    providerCrawledAt: ingestedAt,
    providerTickers: normalizeProviderTickers(raw.tickers),
    providerTags: tags,
    crawlPublishLagSeconds: lag,
    isBackfillCandidate: isBackfillCandidate(lag, backfillLagSeconds),
    contentHash: computeContentHash({ title, url, description }),
  };
}
