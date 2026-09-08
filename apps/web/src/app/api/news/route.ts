import { NextResponse } from 'next/server';
import { decodeNewsCursor, NEWS_API_MAX_LIMIT, NEWS_PAGE_SIZE } from '@/lib/news/public';
import { loadPublicNewsFeed } from '@/lib/news/feed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public news feed — DB-backed only. Never calls the upstream news provider.
 * Respects SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED via loadPublicNewsFeed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const cursorRaw = url.searchParams.get('cursor');

  let limit = NEWS_PAGE_SIZE;
  if (limitRaw != null && limitRaw !== '') {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    if (parsed > NEWS_API_MAX_LIMIT) {
      return NextResponse.json(
        { error: `limit must be <= ${NEWS_API_MAX_LIMIT}` },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  let cursor = null;
  if (cursorRaw) {
    cursor = decodeNewsCursor(cursorRaw);
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  const feed = await loadPublicNewsFeed({ limit, cursor });
  return NextResponse.json(feed, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}
