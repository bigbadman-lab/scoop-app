import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NewsFeed } from '@/components/news/NewsFeed';
import { NEWS_LEAD_ROTATION_MS } from '@/lib/news/lead-rotation';
import {
  NEWS_UI_POLL_MS,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
} from '@/lib/news/public';

const searchParams = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

function item(
  partial: Partial<PublicNewsItem> & Pick<PublicNewsItem, 'id' | 'headline'>,
): PublicNewsItem {
  return {
    summary: null,
    sourceDomain: 'ft.com',
    url: `https://ft.com/${partial.id}`,
    publishedAt: '2026-01-01T00:00:00.000Z',
    tickers: [],
    marketCount: 0,
    markets: [],
    ...partial,
  };
}

function feedItems(): PublicNewsItem[] {
  return [
    item({
      id: 'A',
      headline: 'Alpha lead',
      sourceDomain: 'alpha.com',
      tickers: ['AAA'],
      marketCount: 0,
      publishedAt: '2026-09-12T12:00:00.000Z',
    }),
    item({
      id: 'B',
      headline: 'Bravo lead',
      sourceDomain: 'bravo.com',
      tickers: ['BBB'],
      marketCount: 1,
      markets: [
        {
          chainId: 4663,
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          symbol: 'HELLO',
          name: 'Hello',
          quoteAsset: '0x0000000000000000000000000000000000000000',
          launchedAt: 1,
          ageSeconds: 60,
          priceUsdDisplay: '1',
          fdvUsdDisplay: '1000',
          volume24hUsdDisplay: null,
        },
      ],
      publishedAt: '2026-09-12T11:00:00.000Z',
    }),
    item({
      id: 'C',
      headline: 'Charlie lead',
      sourceDomain: 'charlie.com',
      tickers: ['CCC'],
      marketCount: 3,
      markets: [
        {
          chainId: 4663,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          symbol: 'AAA',
          name: 'Aaa',
          quoteAsset: '0x0000000000000000000000000000000000000000',
          launchedAt: 3,
          ageSeconds: 10,
          priceUsdDisplay: null,
          fdvUsdDisplay: null,
          volume24hUsdDisplay: null,
        },
        {
          chainId: 4663,
          tokenAddress: '0x2222222222222222222222222222222222222222',
          symbol: 'BBB',
          name: 'Bbb',
          quoteAsset: '0x0000000000000000000000000000000000000000',
          launchedAt: 2,
          ageSeconds: 20,
          priceUsdDisplay: null,
          fdvUsdDisplay: null,
          volume24hUsdDisplay: null,
        },
        {
          chainId: 4663,
          tokenAddress: '0x3333333333333333333333333333333333333333',
          symbol: 'CCC',
          name: 'Ccc',
          quoteAsset: '0x0000000000000000000000000000000000000000',
          launchedAt: 1,
          ageSeconds: 30,
          priceUsdDisplay: null,
          fdvUsdDisplay: null,
          volume24hUsdDisplay: null,
        },
      ],
      publishedAt: '2026-09-12T10:00:00.000Z',
    }),
    item({ id: 'D', headline: 'Delta lead', publishedAt: '2026-09-12T09:00:00.000Z' }),
    item({ id: 'E', headline: 'Echo lead', publishedAt: '2026-09-12T08:00:00.000Z' }),
    item({ id: 'F', headline: 'Foxtrot static', publishedAt: '2026-09-12T07:00:00.000Z' }),
    item({ id: 'G', headline: 'Golf static', publishedAt: '2026-09-12T06:00:00.000Z' }),
  ];
}

function okFeed(
  items: PublicNewsItem[],
  nextCursor: string | null = null,
  category: PublicNewsFeedResponse['category'] = 'stocks',
): PublicNewsFeedResponse {
  return {
    status: 'ok',
    category,
    asOf: new Date().toISOString(),
    lastSuccessfulIngestAt:
      category === 'markets' ? null : new Date().toISOString(),
    nextCursor,
    items,
  };
}

function emptyFeed(
  category: PublicNewsFeedResponse['category'],
): PublicNewsFeedResponse {
  return {
    status: 'empty',
    category,
    asOf: new Date().toISOString(),
    lastSuccessfulIngestAt: category === 'markets' ? null : null,
    nextCursor: null,
    items: [],
    message: 'No stories yet.',
  };
}

function renderFeed(items = feedItems(), nextCursor: string | null = null) {
  return render(<NewsFeed initial={okFeed(items, nextCursor)} />);
}

function flushLeadFade() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('NewsFeed lead rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchParams.delete('category');
    replaceMock.mockReset();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(okFeed(feedItems())),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps a stable static feed while the lead rotates through the top pool', () => {
    renderFeed();

    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');
    expect(screen.getByText('Alpha lead')).toBeTruthy();
    expect(screen.getByText('Foxtrot static')).toBeTruthy();
    expect(screen.getByText('Golf static')).toBeTruthy();
    expect(screen.queryByText('Bravo lead')).toBeNull();

    const staticHeadlines = screen
      .getByTestId('news-feed-list')
      .querySelectorAll('[data-testid="news-feed-item"]');
    expect([...staticHeadlines].map((el) => el.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Foxtrot static'),
        expect.stringContaining('Golf static'),
      ]),
    );
    expect(staticHeadlines).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();

    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');
    expect(screen.getByText('Bravo lead')).toBeTruthy();
    expect(screen.getByText('Foxtrot static')).toBeTruthy();
    expect(screen.getByText('Golf static')).toBeTruthy();
    expect(screen.queryByText('Alpha lead')).toBeNull();
    expect(screen.getByTestId('news-feed-list').querySelectorAll('[data-testid="news-feed-item"]')).toHaveLength(
      2,
    );
  });

  it('rotates headline, publisher, market status, and launch provenance together', () => {
    renderFeed();
    const lead = () => screen.getByTestId('news-lead-slot');

    expect(within(lead()).getByTestId('news-market-status').textContent).toMatch(
      /NO LIVE MARKETS/i,
    );
    expect(within(lead()).getByRole('link', { name: /launch market/i }).getAttribute('href')).toBe(
      '/news/A/launch',
    );
    expect(within(lead()).getByRole('link', { name: /read story/i }).getAttribute('href')).toBe(
      'https://ft.com/A',
    );

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();

    expect(within(lead()).getByText('bravo.com')).toBeTruthy();
    expect(within(lead()).getByText('BBB')).toBeTruthy();
    const status = within(lead()).getByTestId('news-market-status');
    expect(status.textContent).toMatch(/1 LIVE MARKET/i);
    expect(status.getAttribute('href')).toBe(
      '/token/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
    expect(
      within(lead()).getByRole('link', { name: /launch another market/i }).getAttribute('href'),
    ).toBe('/news/B/launch');
    expect(within(lead()).getByRole('link', { name: /read story/i }).getAttribute('href')).toBe(
      'https://ft.com/B',
    );

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();

    expect(within(lead()).getByText('Charlie lead')).toBeTruthy();
    const multi = within(lead()).getByTestId('news-market-status');
    expect(multi.textContent).toMatch(/3 LIVE MARKETS/i);
    fireEvent.click(multi);
    expect(screen.getByRole('link', { name: /\$AAA/i }).getAttribute('href')).toBe(
      '/token/0x1111111111111111111111111111111111111111',
    );
  });

  it('marks the newest lead as Latest and later pool items as Live story with N of M', () => {
    renderFeed();
    const kicker = () => screen.getByTestId('news-lead-kicker');
    expect(kicker().textContent).toMatch(/Latest/i);
    expect(kicker().textContent).not.toMatch(/Live desk/i);
    expect(within(kicker()).getByTestId('news-lead-position').textContent).toMatch(/1 of 5/i);

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();
    expect(kicker().textContent).toMatch(/Live story/i);
    expect(within(kicker()).getByTestId('news-lead-position').textContent).toMatch(/2 of 5/i);
  });

  it('does not rotate a single-story lead pool', () => {
    renderFeed([item({ id: 'only', headline: 'Only story' })]);
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-count')).toBe('1');
    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS * 3);
    });
    expect(screen.getByText('Only story')).toBeTruthy();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('only');
    expect(screen.getByTestId('news-feed-list').children).toHaveLength(0);
  });

  it('pauses rotation while hovering the lead and resumes with a fresh interval', () => {
    renderFeed();
    const lead = screen.getByTestId('news-lead-slot');
    fireEvent.mouseEnter(lead);
    expect(lead.getAttribute('data-lead-paused')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS * 2);
    });
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');

    fireEvent.mouseLeave(lead);
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-paused')).toBe('false');

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS - 1);
    });
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    flushLeadFade();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');
  });

  it('pauses rotation while focus stays inside the lead', () => {
    renderFeed();
    const lead = screen.getByTestId('news-lead-slot');
    const launch = within(lead).getByRole('link', { name: /launch market/i });
    fireEvent.focus(launch);
    expect(lead.getAttribute('data-lead-paused')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS * 2);
    });
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');

    fireEvent.blur(launch);
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-paused')).toBe('false');
  });

  it('preserves the active lead when a poll returns the same lead pool', async () => {
    renderFeed();
    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');

    // Pause rotation so only the feed poll (still 8s) can update the snapshot.
    fireEvent.mouseEnter(screen.getByTestId('news-lead-slot'));
    act(() => {
      vi.advanceTimersByTime(NEWS_UI_POLL_MS - NEWS_LEAD_ROTATION_MS);
    });
    await flushMicrotasks();

    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');
    expect(screen.getByText('Bravo lead')).toBeTruthy();
    expect(screen.getByText('Foxtrot static')).toBeTruthy();
  });

  it('falls back when the active lead disappears from a new snapshot', async () => {
    renderFeed();
    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          okFeed([
            item({ id: 'Z', headline: 'Zulu new' }),
            item({ id: 'Y', headline: 'Yankee new' }),
            item({ id: 'X', headline: 'Xray new' }),
            item({ id: 'W', headline: 'Whiskey new' }),
            item({ id: 'V', headline: 'Victor new' }),
            item({ id: 'F', headline: 'Foxtrot static' }),
          ]),
        ),
      ),
    );

    fireEvent.mouseEnter(screen.getByTestId('news-lead-slot'));
    act(() => {
      vi.advanceTimersByTime(NEWS_UI_POLL_MS - NEWS_LEAD_ROTATION_MS);
    });
    await flushMicrotasks();
    flushLeadFade();

    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('Z');
    expect(within(screen.getByTestId('news-lead-slot')).getByText('Zulu new')).toBeTruthy();
    expect(within(screen.getByTestId('news-lead-slot')).queryByText('Bravo lead')).toBeNull();
    expect(screen.getByText('Foxtrot static')).toBeTruthy();
  });

  it('appends load-more stories only to the static feed', async () => {
    const older = item({ id: 'H', headline: 'Hotel older' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('cursor=')) {
          return Response.json(okFeed([older], null));
        }
        return Response.json(okFeed(feedItems(), 'cursor-1'));
      }),
    );

    renderFeed(feedItems(), 'cursor-1');
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await flushMicrotasks();

    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');
    expect(screen.getByText('Hotel older')).toBeTruthy();
    expect(screen.getByText('Foxtrot static')).toBeTruthy();
    expect(
      screen.getByTestId('news-feed-list').querySelectorAll('[data-testid="news-feed-item"]'),
    ).toHaveLength(3);
  });
});

describe('NewsFeed baseline', () => {
  beforeEach(() => {
    searchParams.delete('category');
    replaceMock.mockReset();
  });

  it('renders gated and empty states', () => {
    const { unmount } = render(
      <NewsFeed
        initial={{
          status: 'gated',
          category: 'stocks',
          lastSuccessfulIngestAt: null,
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [],
          message: 'gated msg',
        }}
      />,
    );
    expect(screen.getByText(/News display pending/i)).toBeTruthy();
    unmount();

    render(
      <NewsFeed
        initial={{
          status: 'empty',
          category: 'stocks',
          lastSuccessfulIngestAt: null,
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [],
          message: 'empty msg',
        }}
      />,
    );
    expect(screen.getByText(/No stories yet/i)).toBeTruthy();
    expect(screen.getByTestId('news-category-stocks').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('shows freshness and zero-market metadata on the lead', () => {
    const now = Date.parse('2026-09-08T16:00:00.000Z');
    vi.setSystemTime(now);
    render(
      <NewsFeed
        initial={{
          status: 'ok',
          category: 'stocks',
          asOf: new Date(now).toISOString(),
          lastSuccessfulIngestAt: new Date(now - 4 * 60_000).toISOString(),
          nextCursor: null,
          items: [
            item({
              id: '2',
              headline: 'Newer story',
              publishedAt: new Date(now - 5 * 60_000).toISOString(),
              tickers: ['AAPL'],
            }),
          ],
        }}
      />,
    );

    expect(screen.getByText('Newer story')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Market feed/i })).toBeTruthy();
    expect(screen.getByTestId('news-category-browse')).toBeTruthy();
    expect(screen.getByTestId('news-lead-kicker').textContent).toMatch(/Latest/i);
    expect(screen.getByTestId('news-lead-kicker').textContent).not.toMatch(/Live desk/i);
    expect(screen.queryByTestId('news-lead-position')).toBeNull();
    expect(screen.queryByTestId('news-freshness-badge')).toBeNull();
    expect(screen.getByTestId('news-market-status').textContent).toMatch(/NO LIVE MARKETS/i);
    expect(screen.getByTestId('news-market-status').tagName).toBe('SPAN');
    expect(screen.getByTestId('news-last-pull').textContent).toMatch(/Last pull 4m ago/);
    vi.useRealTimers();
  });
});

describe('NewsFeed category switching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchParams.delete('category');
    replaceMock.mockReset();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('defaults to Stocks with Stocks card selected', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(okFeed(feedItems()))),
    );
    renderFeed();
    expect(screen.getByTestId('news-feed').getAttribute('data-category')).toBe('stocks');
    expect(screen.getByTestId('news-category-stocks').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('news-category-markets').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByText('Alpha lead')).toBeTruthy();
    expect(screen.getByText(/Stock-moving company news/i)).toBeTruthy();
    expect(screen.getByText(/Macro, policy and events moving the tape/i)).toBeTruthy();
  });

  it('shows Markets empty state without falling back to Stocks', async () => {
    searchParams.set('category', 'markets');
    render(<NewsFeed initial={emptyFeed('markets')} />);
    expect(screen.getByTestId('news-feed').getAttribute('data-category')).toBe('markets');
    expect(screen.getByTestId('news-category-markets').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('news-empty-state').textContent).toMatch(
      /No Markets stories yet/i,
    );
    expect(screen.queryByText('Alpha lead')).toBeNull();
    expect(screen.getByTestId('news-last-pull').textContent).toMatch(/Last pull —/);
    expect(screen.getByTestId('news-ingest-freshness').textContent).not.toMatch(/^Live/i);
  });

  it('replaces the feed when switching Stocks → Markets and resets pagination', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('category=markets')) {
        return Response.json(emptyFeed('markets'));
      }
      if (url.includes('cursor=')) {
        return Response.json(
          okFeed([item({ id: 'H', headline: 'Hotel older' })], null),
        );
      }
      return Response.json(okFeed(feedItems(), 'cursor-stocks'));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderFeed(feedItems(), 'cursor-stocks');
    expect(screen.getByRole('button', { name: /load more/i })).toBeTruthy();

    fireEvent.click(screen.getByTestId('news-category-markets'));
    await flushMicrotasks();

    expect(replaceMock).toHaveBeenCalledWith('/news?category=markets', { scroll: false });
    expect(screen.getByTestId('news-feed').getAttribute('data-category')).toBe('markets');
    expect(screen.getByTestId('news-empty-state').textContent).toMatch(
      /No Markets stories yet/i,
    );
    expect(screen.queryByText('Alpha lead')).toBeNull();
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('category=markets')),
    ).toBe(true);
  });

  it('polls only the selected category and ignores stale responses', async () => {
    let resolveMarkets: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('category=markets')) {
        return new Promise<Response>((resolve) => {
          resolveMarkets = resolve;
        });
      }
      return Response.json(okFeed(feedItems()));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderFeed();
    fireEvent.click(screen.getByTestId('news-category-markets'));
    await flushMicrotasks();

    // Switch back to Stocks before Markets resolves.
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('category=stocks')) {
        return Response.json(okFeed(feedItems()));
      }
      return Response.json(emptyFeed('markets'));
    });
    fireEvent.click(screen.getByTestId('news-category-stocks'));
    await flushMicrotasks();

    // Late Markets response must not overwrite Stocks.
    resolveMarkets?.(Response.json(emptyFeed('markets')));
    await flushMicrotasks();

    expect(screen.getByTestId('news-feed').getAttribute('data-category')).toBe('stocks');
    expect(screen.getByText('Alpha lead')).toBeTruthy();

    fetchMock.mockClear();
    act(() => {
      vi.advanceTimersByTime(NEWS_UI_POLL_MS);
    });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('category=stocks');
      expect(String(call[0])).not.toContain('category=markets');
    }
  });

  it('retains category on load more', async () => {
    searchParams.set('category', 'markets');
    const marketItems = [
      item({ id: 'M1', headline: 'Macro one' }),
      item({ id: 'M2', headline: 'Macro two' }),
      item({ id: 'M3', headline: 'Macro three' }),
      item({ id: 'M4', headline: 'Macro four' }),
      item({ id: 'M5', headline: 'Macro five' }),
      item({ id: 'M6', headline: 'Macro six' }),
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('cursor=')) {
        expect(url).toContain('category=markets');
        return Response.json(
          okFeed([item({ id: 'M7', headline: 'Macro seven' })], null, 'markets'),
        );
      }
      return Response.json(okFeed(marketItems, 'cursor-m', 'markets'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NewsFeed initial={okFeed(marketItems, 'cursor-m', 'markets')} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await flushMicrotasks();

    expect(screen.getByText('Macro seven')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).includes('category=markets') &&
          String(call[0]).includes('cursor='),
      ),
    ).toBe(true);
  });

  it('keeps 4s lead rotation after category remount', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(okFeed(feedItems()))),
    );
    renderFeed();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('A');
    act(() => {
      vi.advanceTimersByTime(NEWS_LEAD_ROTATION_MS);
    });
    flushLeadFade();
    expect(screen.getByTestId('news-lead-slot').getAttribute('data-lead-id')).toBe('B');
  });
});
