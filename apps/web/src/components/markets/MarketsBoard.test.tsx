import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketsBoard } from '@/components/markets/MarketsBoard';
import { MarketRow } from '@/components/markets/MarketRow';
import type { MarketsBoardItem, MarketsBoardSnapshot } from '@/lib/markets/types';
import { buildPageMetadata } from '@/lib/seo/site';
import { SEO_SITEMAP_STATIC_PATHS } from '@/lib/seo/build-sitemap';

vi.mock('@/lib/markets/fetch-markets', () => ({
  fetchMarketsBoard: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/live/create-live-poll', () => ({
  createLivePoll: () => ({
    start: () => {},
    stop: () => {},
    refreshNow: () => {},
    getSnapshot: () => ({ status: 'ok', items: [], updatedAt: null }),
  }),
}));

function market(partial: Partial<MarketsBoardItem> & Pick<MarketsBoardItem, 'tokenAddress'>): MarketsBoardItem {
  return {
    name: 'Hello',
    symbol: 'HELLO',
    imageUri: '',
    displayImageUrl: null,
    quoteAsset: '0x0000000000000000000000000000000000000000',
    quoteSymbol: 'ETH',
    quoteImageUrl: null,
    fdvUsdX18: '1000',
    fdvUsdDisplay: '1000',
    ...partial,
  };
}

describe('MarketsBoard UI', () => {
  it('renders initial SSR snapshot with ranks, FDV, pair, and token links', () => {
    const initial: MarketsBoardSnapshot = {
      status: 'ok',
      updatedAt: Date.now(),
      items: [
        market({
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          name: 'Hello World',
          symbol: 'HELLO',
          fdvUsdDisplay: '184200',
        }),
        market({
          tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          name: 'No Fdv',
          symbol: 'NONE',
          fdvUsdX18: null,
          fdvUsdDisplay: null,
        }),
      ],
    };

    render(<MarketsBoard initial={initial} />);

    expect(screen.getByTestId('markets-list')).toBeTruthy();
    expect(screen.getByTestId('markets-live').textContent).toMatch(/Live/i);
    const rows = screen.getAllByTestId('market-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Hello World')).toBeTruthy();
    expect(screen.getByText('$HELLO / ETH')).toBeTruthy();
    expect(screen.getByLabelText('Rank 1')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Hello World/i }).getAttribute('href'),
    ).toBe('/token/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373');
    expect(screen.getAllByTestId('market-fdv').map((el) => el.textContent)).toEqual([
      '$184.20K',
      '—',
    ]);
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
});

describe('MarketRow', () => {
  it('links to /token/[address]', () => {
    render(
      <ul>
        <MarketRow
          rank={3}
          market={market({
            tokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            symbol: 'CCC',
          })}
        />
      </ul>,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/token/0xcccccccccccccccccccccccccccccccccccccccc',
    );
    expect(screen.getByLabelText('Rank 3')).toBeTruthy();
  });
});

describe('markets SEO', () => {
  it('uses canonical https://scoop.fun/markets', () => {
    const meta = buildPageMetadata({
      title: 'Markets',
      description: 'Active SCOOP markets ranked by FDV.',
      path: '/markets',
    });
    expect(meta.alternates).toEqual({
      canonical: expect.stringMatching(/\/markets$/),
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('includes /markets in the sitemap static paths', () => {
    expect(SEO_SITEMAP_STATIC_PATHS).toContain('/markets');
  });
});
