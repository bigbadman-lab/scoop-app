import { createHash } from 'node:crypto';
import type { ProviderNewsArticle, TiingoNewsArticleRaw } from './types.js';

export const TIINGO_PROVIDER = 'tiingo' as const;

/** Default 6h — product-configurable via TIINGO_BACKFILL_LAG_SECONDS. */
export const DEFAULT_BACKFILL_LAG_SECONDS = 21_600;

/**
 * Lightweight domain normalization.
 * https://www.reuters.com/foo → reuters.com
 * https://finance.yahoo.com/... → finance.yahoo.com
 */
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

/** Conservative: trim + lowercase, drop empties, dedupe. */
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

export function parseTiingoDate(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
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

/** Strip common tracking params; null if unchanged. */
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

export type NormalizeOptions = {
  backfillLagSeconds?: number;
};

/**
 * Map Tiingo REST article → canonical provider article.
 * Preserves provider facts; does not “correct” tickers with AI.
 */
export function normalizeTiingoArticle(
  raw: TiingoNewsArticleRaw,
  options: NormalizeOptions = {},
): ProviderNewsArticle {
  const backfillLagSeconds = options.backfillLagSeconds ?? DEFAULT_BACKFILL_LAG_SECONDS;

  const title = String(raw.title ?? '').trim();
  if (!title) throw new Error('Tiingo article missing title');

  const url = String(raw.url ?? '').trim();
  if (!url) throw new Error('Tiingo article missing url');

  const publishedAt = parseTiingoDate(raw.publishedDate);
  const crawledAt = parseTiingoDate(raw.crawlDate);
  if (!publishedAt || !crawledAt) {
    throw new Error('Tiingo article missing publishedDate or crawlDate');
  }

  const descRaw = raw.description == null ? null : String(raw.description).trim();
  const description = descRaw && descRaw.length > 0 ? descRaw : null;

  const sourceRaw = String(raw.source ?? '').trim();
  const sourceDomain =
    normalizeNewsDomain(sourceRaw) || normalizeNewsDomain(url) || 'unknown';

  const lag = computeCrawlPublishLagSeconds(crawledAt, publishedAt);

  return {
    provider: TIINGO_PROVIDER,
    providerArticleId: String(raw.id),
    title,
    description,
    sourceDomain,
    url,
    canonicalUrl: canonicalizeUrl(url),
    providerPublishedAt: publishedAt,
    providerCrawledAt: crawledAt,
    providerTickers: normalizeProviderTickers(raw.tickers),
    providerTags: normalizeProviderTags(raw.tags),
    crawlPublishLagSeconds: lag,
    isBackfillCandidate: isBackfillCandidate(lag, backfillLagSeconds),
    contentHash: computeContentHash({ title, url, description }),
  };
}
