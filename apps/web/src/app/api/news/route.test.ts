import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPublicNewsFeed = vi.fn();

vi.mock('@/lib/news/feed', () => ({
  loadPublicNewsFeed: (...args: unknown[]) => loadPublicNewsFeed(...args),
}));

describe('GET /api/news', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPublicNewsFeed.mockResolvedValue({
      status: 'ok',
      items: [
        {
          id: '1',
          headline: 'Story',
          sourceDomain: 'example.com',
          url: 'https://example.com/s',
          publishedAt: '2026-09-07T12:00:00.000Z',
          tickers: [],
        },
      ],
      nextCursor: null,
      lastSuccessfulIngestAt: null,
      asOf: '2026-09-07T12:00:00.000Z',
    });
  });

  it('rejects invalid limit and does not leak secrets', async () => {
    const { GET } = await import('@/app/api/news/route');
    const res = await GET(new Request('http://localhost/api/news?limit=0'));
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('TIINGO');
  });

  it('caps limit at max', async () => {
    const { GET } = await import('@/app/api/news/route');
    const res = await GET(new Request('http://localhost/api/news?limit=999'));
    expect(res.status).toBe(400);
  });

  it('returns DB-backed feed JSON', async () => {
    const { GET } = await import('@/app/api/news/route');
    const res = await GET(new Request('http://localhost/api/news?limit=10'));
    expect(res.status).toBe(200);
    expect(loadPublicNewsFeed).toHaveBeenCalledWith({
      limit: 10,
      cursor: null,
    });
    const body = await res.json();
    expect(body.items[0].headline).toBe('Story');
    expect(JSON.stringify(body)).not.toContain('isBackfillCandidate');
  });

  it('rejects bad cursor', async () => {
    const { GET } = await import('@/app/api/news/route');
    const res = await GET(new Request('http://localhost/api/news?cursor=nope'));
    expect(res.status).toBe(400);
  });
});
