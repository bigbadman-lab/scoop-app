import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MarketsBoard } from '@/components/markets/MarketsBoard';
import { MarketRow } from '@/components/markets/MarketRow';
import type { MarketsBoardItem, MarketsBoardSnapshot } from '@/lib/markets/types';
import { buildMarketsBoardItems } from '@/lib/markets/types';
import { buildPageMetadata } from '@/lib/seo/site';
import { SEO_SITEMAP_STATIC_PATHS } from '@/lib/seo/build-sitemap';
import type { TokenDiscoveryItem } from '@scoop/db';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
const TOKEN_ADDR = '0x259D3f3412345678901234567890123456784379';

const fetchMarketsBoard = vi.fn();

vi.mock('@/lib/markets/fetch-markets', () => ({
  fetchMarketsBoard: (...args: unknown[]) => fetchMarketsBoard(...args),
}));

type PollHandlers = {
  fetchSnapshot: (ctx: { signal: AbortSignal }) => Promise<MarketsBoardSnapshot | null>;
  onSnapshot: (data: MarketsBoardSnapshot) => void;
};

let lastPoll: PollHandlers | null = null;

vi.mock('@/lib/live/create-live-poll', () => ({
  createLivePoll: (opts: {
    initial: MarketsBoardSnapshot;
    fetchSnapshot: PollHandlers['fetchSnapshot'];
    onSnapshot: PollHandlers['onSnapshot'];
  }) => {
    lastPoll = {
      fetchSnapshot: opts.fetchSnapshot,
      onSnapshot: opts.onSnapshot,
    };
    return {
      start: () => {
        opts.onSnapshot(opts.initial);
      },
      stop: () => {},
      refreshNow: () => {},
      getSnapshot: () => opts.initial,
    };
  },
}));

function market(
  partial: Partial<MarketsBoardItem> & Pick<MarketsBoardItem, 'tokenAddress'>,
): MarketsBoardItem {
  return {
    name: 'Hello',
    symbol: 'HELLO',
    imageUri: '',
    displayImageUrl: null,
    quoteAsset: '0x0000000000000000000000000000000000000000',
    quoteSymbol: 'ETH',
    quoteImageUrl: 'https://cdn.example/eth.png',
    launchedAt: 1_700_000_000,
    ageSeconds: 100,
    fdvUsdX18: '1000',
    fdvUsdDisplay: '1000',
    tradeCountAllTime: 42,
    tradeCount24h: 4,
    holderCountAll: 20,
    holderCountRetail: 17,
    loreTitle: null,
    ...partial,
  };
}

function boardItems(): MarketsBoardItem[] {
  return [
    market({
      tokenAddress: '0xaaa',
      name: 'Alpha High Fdv',
      symbol: 'ALPHA',
      launchedAt: 100,
      tradeCountAllTime: 5,
      fdvUsdDisplay: '3000',
    }),
    market({
      tokenAddress: '0xbbb',
      name: 'Coinbase',
      symbol: 'COIN',
      launchedAt: 300,
      tradeCountAllTime: 50,
      fdvUsdDisplay: '2000',
    }),
    market({
      tokenAddress: '0xccc',
      name: 'Hello World',
      symbol: 'HELLO',
      launchedAt: 200,
      tradeCountAllTime: 10,
      fdvUsdDisplay: '1000',
      quoteImageUrl: null,
    }),
  ];
}

function renderBoard(items = boardItems(), overrides: Partial<MarketsBoardSnapshot> = {}) {
  return render(
    <MarketsBoard
      initial={{
        status: 'ok',
        updatedAt: Date.now(),
        liveHealth: 'live',
        items,
        ...overrides,
      }}
    />,
  );
}

describe('MarketsBoard UI', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders MARKET FEED header, discovery controls, LIVE, and denser rows', () => {
    renderBoard();

    expect(screen.getByTestId('markets-feed-label').textContent).toMatch(/Market feed/i);
    expect(screen.getByTestId('markets-list')).toBeTruthy();
    expect(screen.getByTestId('markets-live').textContent).toMatch(/Live/i);
    expect(screen.getByTestId('markets-updated-at').textContent).toMatch(/Updated/i);
    expect(screen.getByTestId('markets-sort-trending')).toBeTruthy();
    expect(screen.getByTestId('markets-search')).toBeTruthy();
    expect(screen.getByTestId('markets-mobile-header')).toBeTruthy();
    expect(screen.getByTestId('markets-desktop-header')).toBeTruthy();

    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute('data-leader')).toBe('true');
    expect(rows[0]!.querySelector('[data-testid="market-leader-flame"]')).toBeTruthy();
    expect(rows[1]!.getAttribute('data-leader')).toBe('false');
    expect(rows[1]!.querySelector('[data-testid="market-leader-flame"]')).toBeNull();
  });

  it('SSR Updated label is stable against wall-clock drift past snapshot.updatedAt', () => {
    const updatedAt = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(updatedAt + 1_500);

    const html = renderToString(
      <MarketsBoard
        initial={{
          status: 'ok',
          updatedAt,
          liveHealth: 'live',
          items: boardItems(),
        }}
      />,
    );
    expect(html).toContain('Updated now');
    expect(html).not.toContain('Updated 1s ago');
  });

  it('ticks the Updated label from wall clock after mount', () => {
    const updatedAt = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(updatedAt + 1_500);

    const { unmount } = renderBoard(boardItems(), { updatedAt });

    // Mount effect syncs nowMs to Date.now().
    expect(screen.getByTestId('markets-updated-at').textContent).toBe('Updated 1s ago');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('markets-updated-at').textContent).toBe('Updated 2s ago');

    unmount();
  });

  it('shows quote badge with catalogue icon when present', () => {
    render(
      <ul>
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: '0xbbb',
            symbol: 'COIN',
            quoteSymbol: 'ETH',
            quoteImageUrl: 'https://cdn.example/eth.png',
          })}
        />
      </ul>,
    );
    const badges = screen.getAllByTestId('quote-asset-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]!.textContent).toMatch(/ETH/i);
    expect(badges[0]!.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/eth.png');
  });

  it('quote badge degrades to ticker without broken image when icon missing', () => {
    render(
      <ul>
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: '0xccc',
            symbol: 'HELLO',
            quoteSymbol: 'NVDA',
            quoteImageUrl: null,
          })}
        />
      </ul>,
    );
    const badges = screen.getAllByTestId('quote-asset-badge');
    expect(badges[0]!.textContent).toMatch(/NVDA/i);
    expect(badges[0]!.querySelector('img')).toBeNull();
    expect(screen.getAllByTestId('quote-asset-monogram').length).toBeGreaterThan(0);
  });

  it('search preserves canonical ranks and does not promote a filtered row to #1', () => {
    renderBoard();
    fireEvent.change(screen.getByTestId('markets-search'), {
      target: { value: 'hello' },
    });
    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute('data-token')).toBe('0xccc');
    expect(rows[0]!.getAttribute('data-rank')).toBe('3');
    expect(rows[0]!.getAttribute('data-leader')).toBe('false');
    expect(rows[0]!.querySelector('[data-testid="market-leader-flame"]')).toBeNull();
  });

  it('Newest and Most traded reorder using live snapshot fields', () => {
    renderBoard();

    fireEvent.click(screen.getByTestId('markets-sort-newest'));
    expect(screen.getAllByTestId('market-row').map((r) => r.getAttribute('data-token'))).toEqual([
      '0xbbb',
      '0xccc',
      '0xaaa',
    ]);
    expect(screen.getAllByTestId('market-row')[0]!.getAttribute('data-leader')).toBe('true');

    fireEvent.click(screen.getByTestId('markets-sort-trades'));
    expect(screen.getAllByTestId('market-row').map((r) => r.getAttribute('data-token'))).toEqual([
      '0xbbb',
      '0xccc',
      '0xaaa',
    ]);
  });

  it('changing discovery tabs does not mark a leadership pulse', () => {
    renderBoard();
    fireEvent.click(screen.getByTestId('markets-sort-newest'));
    const leader = screen.getAllByTestId('market-row')[0]!;
    expect(leader.getAttribute('data-leader-pulse')).toBe('false');
  });

  it('live data causing a genuine #1 identity change pulses the new leader', async () => {
    renderBoard();
    expect(lastPoll).toBeTruthy();

    const reordered: MarketsBoardSnapshot = {
      status: 'ok',
      updatedAt: Date.now(),
      liveHealth: 'live',
      items: [
        market({
          tokenAddress: '0xbbb',
          name: 'Coinbase',
          symbol: 'COIN',
          launchedAt: 300,
          tradeCountAllTime: 50,
          fdvUsdDisplay: '9000',
          fdvUsdX18: '9000',
        }),
        market({
          tokenAddress: '0xaaa',
          name: 'Alpha High Fdv',
          symbol: 'ALPHA',
          launchedAt: 100,
          tradeCountAllTime: 5,
          fdvUsdDisplay: '1000',
          fdvUsdX18: '1000',
        }),
        market({
          tokenAddress: '0xccc',
          name: 'Hello World',
          symbol: 'HELLO',
          launchedAt: 200,
          tradeCountAllTime: 10,
          fdvUsdDisplay: '500',
          fdvUsdX18: '500',
        }),
      ],
    };

    await act(async () => {
      lastPoll!.onSnapshot(reordered);
    });

    const leader = screen.getAllByTestId('market-row')[0]!;
    expect(leader.getAttribute('data-token')).toBe('0xbbb');
    expect(leader.getAttribute('data-leader')).toBe('true');
    expect(leader.getAttribute('data-leader-pulse')).toBe('true');
  });

  it('initial render does not set leadership pulse', () => {
    renderBoard();
    expect(screen.getAllByTestId('market-row')[0]!.getAttribute('data-leader-pulse')).toBe(
      'false',
    );
  });

  it('shows empty state without fake rows', () => {
    render(
      <MarketsBoard
        initial={{
          status: 'empty',
          items: [],
          updatedAt: Date.now(),
          message: 'No active markets yet.',
        }}
      />,
    );
    expect(screen.getByTestId('markets-empty').textContent).toMatch(/No active markets yet/i);
    expect(screen.queryByTestId('markets-list')).toBeNull();
  });

  it('search no-results state', () => {
    renderBoard();
    fireEvent.change(screen.getByTestId('markets-search'), {
      target: { value: 'zzz-none' },
    });
    expect(screen.getByTestId('markets-no-results').textContent).toMatch(/No markets found/i);
  });
});

describe('MarketRow', () => {
  it('links to /token/[address] and shows pair badge, metrics, and desktop age', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z');
    render(
      <ul>
        <MarketRow
          rank={3}
          nowMs={now}
          market={market({
            tokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            name: 'Coinbase',
            symbol: 'COIN',
            launchedAt: Math.floor(now / 1000) - 18 * 60,
            tradeCountAllTime: 42,
            holderCountRetail: 17,
          })}
        />
      </ul>,
    );
    expect(screen.getByTestId('market-row-link').getAttribute('href')).toBe(
      '/token/0xcccccccccccccccccccccccccccccccccccccccc',
    );
    expect(screen.getAllByTestId('quote-asset-badge')[0]!.textContent).toMatch(/ETH/);
    expect(screen.getByTestId('market-age').textContent).toMatch(/18m ago/);
    expect(screen.getByTestId('market-trades').textContent).toBe('42');
    expect(screen.getByTestId('market-holders').textContent).toBe('17');
    expect(screen.getByTestId('market-fdv').textContent).toBeTruthy();
  });

  it('renders canonical Lore when present and omits it cleanly when absent', () => {
    const { rerender } = render(
      <ul>
        <MarketRow
          rank={1}
          market={market({
            tokenAddress: TOKEN_ADDR,
            loreTitle: 'Meta AI story behind the launch',
          })}
        />
      </ul>,
    );
    expect(screen.getByTestId('market-row').getAttribute('data-has-lore')).toBe('true');
    expect(screen.getAllByTestId('market-lore').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('market-lore')[0]!.textContent).toMatch(
      /Meta AI story behind the launch/,
    );

    rerender(
      <ul>
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: TOKEN_ADDR,
            loreTitle: null,
          })}
        />
      </ul>,
    );
    expect(screen.getByTestId('market-row').getAttribute('data-has-lore')).toBe('false');
    expect(screen.queryByTestId('market-lore')).toBeNull();
  });

  it('does not permanently display contract address on the board row', () => {
    render(
      <ul>
        <MarketRow
          rank={1}
          market={market({ tokenAddress: TOKEN_ADDR, name: 'One', symbol: 'ONE' })}
        />
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            name: 'Two',
            symbol: 'TWO',
          })}
        />
      </ul>,
    );
    expect(screen.queryByTestId('contract-copy')).toBeNull();
    expect(screen.queryByTestId('contract-copy-address')).toBeNull();
    expect(screen.getByTestId('market-leader-flame')).toBeTruthy();
  });

  it('mobile identity is a single non-wrapping track without per-row metric labels', () => {
    render(
      <ul>
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: TOKEN_ADDR,
            name: 'Coinbase',
            symbol: 'COIN',
            loreTitle: 'A long lore headline that must truncate',
          })}
        />
      </ul>,
    );
    const mobile = screen.getByTestId('market-identity-mobile');
    expect(mobile.className).toMatch(/whitespace-nowrap/);
    expect(mobile.className).toMatch(/overflow-hidden/);
    expect(screen.queryByText(/^Fdv$/i)).toBeNull();
    expect(screen.queryByText(/^Trades$/i)).toBeNull();
    expect(screen.queryByText(/^Holders$/i)).toBeNull();
  });
});

describe('markets Lore mapping', () => {
  it('buildMarketsBoardItems carries loreTitle from discovery without inventing context', () => {
    const catalogue: PublicQuoteCatalogueItem[] = [
      {
        quoteAsset: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        displaySymbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        imageUrl: null,
        category: 'crypto',
        sortOrder: 1,
        isRegistered: true,
        isEnabled: true,
        chainId: 4663,
        quoteType: 'native',
        sourceName: null,
      },
    ];
    const base = (overrides: Partial<TokenDiscoveryItem>): TokenDiscoveryItem => ({
      chainId: 4663,
      tokenAddress: '0xaaa',
      name: 'Alpha',
      symbol: 'ALPHA',
      decimals: 18,
      imageUri: '',
      displayImageUrl: null,
      poolId: '0xpool',
      creatorId: '0x1111111111111111111111111111111111111111',
      quoteAsset: '0x0000000000000000000000000000000000000000',
      launchedAt: 1,
      ageSeconds: 1,
      launchProgressBps: 0,
      launchComplete: false,
      isNew: false,
      isSoon: false,
      isBonded: false,
      priceQuoteX18: null,
      priceQuoteDisplay: null,
      priceUsdX18: null,
      priceUsdDisplay: null,
      fdvUsdX18: '100',
      fdvUsdDisplay: '100',
      volume24hQuoteRaw: null,
      volume24hQuoteDisplay: null,
      volume24hUsdX18: null,
      volume24hUsdDisplay: null,
      tradeCount24h: null,
      tradeCountAllTime: 1,
      buyCount24h: null,
      sellCount24h: null,
      holderCountAll: 1,
      holderCountRetail: 1,
      lastTradeAt: null,
      priceChange24hBps: null,
      loreTitle: null,
      ...overrides,
    });
    const items = buildMarketsBoardItems(
      [
        base({
          tokenAddress: '0xbbb',
          loreTitle: 'Canonical news headline',
          fdvUsdX18: '200',
          fdvUsdDisplay: '200',
        }),
        base({ tokenAddress: '0xaaa', loreTitle: null }),
      ],
      catalogue,
    );
    expect(items[0]!.loreTitle).toBe('Canonical news headline');
    expect(items[1]!.loreTitle).toBeNull();
  });
});

describe('markets SEO', () => {
  it('includes /markets in sitemap static paths and page metadata', () => {
    expect(SEO_SITEMAP_STATIC_PATHS).toContain('/markets');
    const meta = buildPageMetadata({
      title: 'Markets',
      description: "Markets for what's happening now.",
      path: '/markets',
    });
    expect(meta.openGraph?.url).toMatch(/\/markets$/);
  });
});
