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

describe('NowSection news lead', () => {
  it('renders house lead hero with real article overlay link', () => {
    render(
      <NowSection
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
        news={{
          status: 'empty',
          article: null,
          articles: [],
          message: 'No stories yet.',
        }}
      />,
    );

    expect(screen.getByTestId('homepage-infrastructure-badges')).toBeTruthy();
    expect(screen.getByText('Built on')).toBeTruthy();
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByText('Powered by')).toBeTruthy();
    expect(screen.getByText('Uniswap')).toBeTruthy();
    expect(screen.getByText('Markets paired with')).toBeTruthy();
    expect(screen.getByText('Stocks + ETH')).toBeTruthy();
    expect(screen.getByText(/Turn/i)).toBeTruthy();
    expect(screen.getByText(/into markets\. Earn from every trade\./i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^news$/i }).getAttribute('href')).toBe('/news');

    const launches = screen.getAllByRole('link', { name: /^launch$/i });
    expect(launches.length).toBeGreaterThan(0);
    expect(launches[0]!.getAttribute('href')).toBe('/launch');

    const heroImg = document.querySelector(`img[src="/scoophero.png"]`);
    expect(heroImg).toBeTruthy();
    expect(heroImg?.getAttribute('alt')).toBe('SCOOP');
  });
});
