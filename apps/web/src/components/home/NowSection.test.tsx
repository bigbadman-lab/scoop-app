import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NowSection } from '@/components/home/NowSection';

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string; priority?: boolean; fill?: boolean }) => {
    const { priority: _p, fill: _f, ...rest } = props;
    void _p;
    void _f;
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-src={props.src} alt={props.alt} {...rest} />;
  },
}));

vi.mock('@/components/home/LiveDeskStrip', () => ({
  LiveDeskStrip: () => <div data-testid="live-desk" />,
}));

const emptyDesk = {
  instruments: [
    { id: 'eth' as const, label: 'ETH', price: null, changePct: null },
    { id: 'btc' as const, label: 'BTC', price: null, changePct: null },
    { id: 'spx' as const, label: 'S&P 500', price: null, changePct: null },
    { id: 'ftse' as const, label: 'FTSE 100', price: null, changePct: null },
  ],
  asOf: new Date().toISOString(),
  source: 'unavailable' as const,
};

describe('NowSection news lead', () => {
  it('renders house lead hero with real article overlay link', () => {
    render(
      <NowSection
        deskSpot={emptyDesk}
        news={{
          status: 'ok',
          article: {
            providerArticleId: '77',
            headline: 'Markets react to rate decision',
            description: null,
            sourceDomain: 'reuters.com',
            url: 'https://reuters.com/markets/rate-decision',
            publishedAt: new Date().toISOString(),
            crawledAt: new Date().toISOString(),
            tickers: [],
            tags: [],
            isBackfillCandidate: false,
            marketCount: 0,
            markets: [],
          },
          articles: [
            {
              providerArticleId: '77',
              headline: 'Markets react to rate decision',
              description: null,
              sourceDomain: 'reuters.com',
              url: 'https://reuters.com/markets/rate-decision',
              publishedAt: new Date().toISOString(),
              crawledAt: new Date().toISOString(),
              tickers: [],
              tags: [],
              isBackfillCandidate: false,
              marketCount: 0,
              markets: [],
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('house-lead-hero')).toBeTruthy();
    expect(screen.getByTestId('house-lead-actions')).toBeTruthy();
    expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
    expect(screen.getByText('reuters.com')).toBeTruthy();
    expect(screen.queryByText(/market activity/i)).toBeNull();

    const actions = screen.getByTestId('house-lead-actions');
    expect(actions.closest('[data-testid="house-lead-hero"]')).toBeTruthy();

    const launch = screen.getByRole('link', { name: /launch market/i });
    expect(launch.getAttribute('href')).toBe('/news/77/launch');
    const read = screen.getByRole('link', { name: /read story/i });
    expect(read.getAttribute('href')).toBe('https://reuters.com/markets/rate-decision');
    expect(launch).not.toBe(read);
  });

  it('does not show Launch market when there is no article', () => {
    render(
      <NowSection
        deskSpot={emptyDesk}
        news={{
          status: 'empty',
          article: null,
          articles: [],
          message: 'No stories yet.',
        }}
      />,
    );
    expect(screen.queryByRole('link', { name: /launch market/i })).toBeNull();
  });

  it('shows gated overlay without inventing a headline', () => {
    render(
      <NowSection
        deskSpot={emptyDesk}
        news={{
          status: 'gated',
          article: null,
          articles: [],
          message: 'Latest story display is not enabled yet.',
        }}
      />,
    );
    expect(screen.getByText('Latest story pending')).toBeTruthy();
    expect(screen.getByText(/not enabled yet/i)).toBeTruthy();
  });

  it('renders infrastructure badges beside the title with Launch intact', () => {
    render(
      <NowSection
        deskSpot={emptyDesk}
        news={{
          status: 'empty',
          article: null,
          articles: [],
          message: 'No stories yet.',
        }}
      />,
    );

    expect(screen.getByTestId('homepage-infrastructure-badges')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('Pump.fun')).toBeTruthy();
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByText('Pons')).toBeTruthy();
    expect(screen.getByText(/Turn what's happening now into a market/i)).toBeTruthy();
    expect(
      screen.getByText(/Solana via Pump\.fun or Robinhood Chain via Pons/i),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /breaking narratives/i }).getAttribute('href'),
    ).toBe('/news');
    expect(screen.getByTestId('homepage-creator-reward-support').textContent).toMatch(
      /recycles creator rewards back into the ecosystem/i,
    );

    const launches = screen.getAllByRole('link', { name: /^launch$/i });
    expect(launches.length).toBeGreaterThan(0);
    expect(launches[0]!.getAttribute('href')).toBe('/launch');

    const heroImg = document.querySelector(`img[src="/scoophero.png"]`);
    expect(heroImg).toBeTruthy();
    expect(heroImg?.getAttribute('alt')).toBe('SCOOP');
  });
});
