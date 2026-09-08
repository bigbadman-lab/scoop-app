import type { NewsFeedCursor, NewsFeedItem } from '@scoop/news';

/** How often `/news` polls SCOOP's own DB-backed API (not the upstream provider). */
export const NEWS_UI_POLL_MS = 60_000;

/** Default page size for the public news feed. */
export const NEWS_PAGE_SIZE = 20;

/** Hard cap for GET /api/news `limit`. */
export const NEWS_API_MAX_LIMIT = 50;

/** Public JSON shape — no backfill/internal flags. */
export type PublicNewsItem = {
  id: string;
  headline: string;
  sourceDomain: string;
  url: string;
  publishedAt: string;
  tickers: string[];
};

export type PublicNewsFeedResponse = {
  status: 'ok' | 'empty' | 'gated' | 'error';
  items: PublicNewsItem[];
  nextCursor: string | null;
  message?: string;
  asOf: string;
};

export function toPublicNewsItem(item: NewsFeedItem): PublicNewsItem {
  return {
    id: item.providerArticleId,
    headline: item.headline,
    sourceDomain: item.sourceDomain,
    url: item.url,
    publishedAt: item.publishedAt,
    tickers: item.tickers,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(raw: string): Uint8Array {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const base64 = padded + pad;
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeNewsCursor(cursor: NewsFeedCursor): string {
  const json = JSON.stringify({ at: cursor.at, id: cursor.providerArticleId });
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeNewsCursor(raw: string): NewsFeedCursor | null {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(raw));
    const parsed = JSON.parse(json) as { at?: unknown; id?: unknown };
    if (typeof parsed.at !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(Date.parse(parsed.at))) return null;
    if (!parsed.id.trim()) return null;
    return { at: parsed.at, providerArticleId: parsed.id };
  } catch {
    return null;
  }
}

export function nextCursorFromItems(
  items: readonly NewsFeedItem[],
  pageSize: number,
): string | null {
  if (items.length < pageSize) return null;
  const last = items[items.length - 1];
  if (!last) return null;
  return encodeNewsCursor({
    at: last.publishedAt,
    providerArticleId: last.providerArticleId,
  });
}
