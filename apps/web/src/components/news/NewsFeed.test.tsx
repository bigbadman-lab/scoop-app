import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NewsFeed } from '@/components/news/NewsFeed';
import type { PublicNewsItem } from '@/lib/news/public';

function item(partial: Partial<PublicNewsItem> & Pick<PublicNewsItem, 'id' | 'headline'>): PublicNewsItem {
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

describe('NewsFeed', () => {
  it('renders chronological items with latest hierarchy and launch buttons', () => {
    const now = Date.parse('2026-09-08T16:00:00.000Z');
    vi.setSystemTime(now);

    render(
      <NewsFeed
        initial={{
          status: 'ok',
          asOf: new Date(now).toISOString(),
          nextCursor: null,
          items: [
            item({
              id: '2',
              headline: 'Newer story',
              publishedAt: new Date(now - 5 * 60_000).toISOString(),
              tickers: ['AAPL'],
            }),
            item({
              id: '1',
              headline: 'Older story',
              publishedAt: '2026-01-01T00:00:00.000Z',
            }),
          ],
        }}
      />,
    );

    expect(screen.getByText('Newer story')).toBeTruthy();
    expect(screen.getByText('Older story')).toBeTruthy();

    const badges = screen.getAllByTestId('news-freshness-badge');
    expect(badges[0]!.textContent).toMatch(/Latest/i);
    expect(badges[0]!.getAttribute('data-freshness')).toBe('latest');

    const rows = screen.getAllByTestId('news-feed-item');
    expect(rows[0]!.getAttribute('data-lead')).toBe('true');
    expect(rows[1]!.getAttribute('data-freshness')).toBe('older');

    const launchLinks = screen.getAllByRole('link', { name: /launch as token/i });
    expect(launchLinks).toHaveLength(2);
    expect(launchLinks[0]!.getAttribute('href')).toBe('/news/2/launch');
    expect(launchLinks[0]!.className).not.toContain('bg-[var(--scoop-orange)]');
    const readLinks = screen.getAllByRole('link', { name: /read story/i });
    expect(readLinks[0]!.getAttribute('href')).toBe('https://ft.com/2');

    vi.useRealTimers();
  });

  it('shows one-market LIVE badge linking to the token page and launch another', () => {
    render(
      <NewsFeed
        initial={{
          status: 'ok',
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [
            item({
              id: 'm1',
              headline: 'Story with market',
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
            }),
          ],
        }}
      />,
    );

    const live = screen.getByTestId('news-market-live');
    expect(live.textContent).toMatch(/MARKET LIVE · \$HELLO/i);
    expect(live.getAttribute('href')).toBe(
      '/token/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
    expect(screen.getByRole('link', { name: /launch another market/i })).toBeTruthy();
  });

  it('opens multi-market selector', () => {
    render(
      <NewsFeed
        initial={{
          status: 'ok',
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [
            item({
              id: 'm3',
              headline: 'Story with three markets',
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
            }),
          ],
        }}
      />,
    );

    const live = screen.getByTestId('news-market-live');
    expect(live.textContent).toMatch(/3 MARKETS LIVE/i);
    fireEvent.click(live);
    expect(screen.getByText(/Markets from this story/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /\$AAA/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /\$BBB/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /\$CCC/i })).toBeTruthy();
  });

  it('marks non-lead stories under an hour as New', () => {
    const now = Date.parse('2026-09-08T16:00:00.000Z');
    vi.setSystemTime(now);

    render(
      <NewsFeed
        initial={{
          status: 'ok',
          asOf: new Date(now).toISOString(),
          nextCursor: null,
          items: [
            item({
              id: 'lead',
              headline: 'Lead story',
              publishedAt: new Date(now - 10 * 60_000).toISOString(),
            }),
            item({
              id: 'fresh',
              headline: 'Also fresh story',
              publishedAt: new Date(now - 20 * 60_000).toISOString(),
            }),
          ],
        }}
      />,
    );

    const rows = screen.getAllByTestId('news-feed-item');
    expect(rows[1]!.getAttribute('data-freshness')).toBe('new');
    vi.useRealTimers();
  });

  it('renders gated and empty states', () => {
    const { unmount } = render(
      <NewsFeed
        initial={{
          status: 'gated',
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
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [],
          message: 'empty msg',
        }}
      />,
    );
    expect(screen.getByText(/No stories yet/i)).toBeTruthy();
  });
});
