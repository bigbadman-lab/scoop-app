import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarketsBoard } from '@/components/markets/MarketsBoard';
import { MarketRow } from '@/components/markets/MarketRow';
import type { MarketsBoardItem, MarketsBoardSnapshot } from '@/lib/markets/types';
import { truncateAddress } from '@/lib/format';
import { buildPageMetadata } from '@/lib/seo/site';
import { SEO_SITEMAP_STATIC_PATHS } from '@/lib/seo/build-sitemap';

const TOKEN_ADDR = '0x259D3f3412345678901234567890123456784379';
const QUOTE_ADDR = '0x1111111111111111111111111111111111111111';

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
  it('renders MARKET FEED header, discovery controls, LIVE, and denser rows', () => {
    renderBoard();

    expect(screen.getByTestId('markets-feed-label').textContent).toMatch(/Market feed/i);
    expect(screen.getByTestId('markets-list')).toBeTruthy();
    expect(screen.getByTestId('markets-live').textContent).toMatch(/Live/i);
    expect(screen.getByTestId('markets-updated-at').textContent).toMatch(/Updated/i);
    expect(screen.getByTestId('markets-sort-trending')).toBeTruthy();
    expect(screen.getByTestId('markets-search')).toBeTruthy();

    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute('data-leader')).toBe('true');
    expect(rows[0]!.querySelector('[data-testid="market-leader-flame"]')).toBeTruthy();
    expect(rows[1]!.getAttribute('data-leader')).toBe('false');
    expect(rows[1]!.querySelector('[data-testid="market-leader-flame"]')).toBeNull();
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
    const badge = screen.getByTestId('quote-asset-badge');
    expect(badge.textContent).toMatch(/ETH/i);
    expect(badge.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/eth.png');
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
    const badge = screen.getByTestId('quote-asset-badge');
    expect(badge.textContent).toMatch(/NVDA/i);
    expect(badge.querySelector('img')).toBeNull();
    expect(screen.getByTestId('quote-asset-monogram')).toBeTruthy();
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
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('links to /token/[address] and shows pair badge · age', () => {
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
    expect(screen.getByTestId('quote-asset-badge').textContent).toMatch(/ETH/);
    expect(screen.getByTestId('market-age').textContent).toBe('18m ago');
    expect(screen.getByTestId('market-trades').textContent).toBe('42');
    expect(screen.getByTestId('market-holders').textContent).toBe('17');
  });

  it('renders shortened token address and copies the full canonical address', async () => {
    render(
      <ul>
        <MarketRow
          rank={2}
          market={market({
            tokenAddress: TOKEN_ADDR,
            quoteAsset: QUOTE_ADDR,
            name: 'Coinbase',
            symbol: 'COIN',
          })}
        />
      </ul>,
    );

    expect(screen.getByTestId('contract-copy-address').textContent).toBe(
      truncateAddress(TOKEN_ADDR),
    );
    expect(screen.getByTestId('contract-copy-address').textContent).not.toBe(
      truncateAddress(QUOTE_ADDR),
    );

    fireEvent.click(screen.getByRole('button', { name: /copy token address/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN_ADDR);
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(QUOTE_ADDR);
    expect(screen.getByRole('button', { name: /token address copied/i })).toBeTruthy();
    expect(screen.getByTestId('contract-copy').getAttribute('data-copied')).toBe('true');
  });

  it('copy action does not activate the market row link', async () => {
    render(
      <ul>
        <MarketRow
          rank={1}
          market={market({
            tokenAddress: TOKEN_ADDR,
            quoteAsset: QUOTE_ADDR,
            name: 'Leader',
            symbol: 'LEAD',
          })}
        />
      </ul>,
    );

    expect(screen.getByTestId('market-row').getAttribute('data-leader')).toBe('true');
    expect(screen.getByTestId('market-leader-flame')).toBeTruthy();

    const link = screen.getByTestId('market-row-link');
    const linkClick = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', linkClick);

    fireEvent.click(screen.getByRole('button', { name: /copy token address/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN_ADDR);
    });
    expect(linkClick).not.toHaveBeenCalled();
  });

  it('shows address copy on both leader and normal rows', () => {
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
    const copies = screen.getAllByTestId('contract-copy');
    expect(copies).toHaveLength(2);
    expect(copies[0]!.textContent).toMatch(truncateAddress(TOKEN_ADDR));
    expect(copies[1]!.textContent).toMatch(
      truncateAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
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
