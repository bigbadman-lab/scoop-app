import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsFeed } from '@/components/news/NewsFeed';

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
            {
              id: '2',
              headline: 'Newer story',
              sourceDomain: 'ft.com',
              url: 'https://ft.com/new',
              publishedAt: new Date(now - 5 * 60_000).toISOString(),
              tickers: ['AAPL'],
            },
            {
              id: '1',
              headline: 'Older story',
              sourceDomain: 'bbc.com',
              url: 'https://bbc.com/old',
              publishedAt: '2026-01-01T00:00:00.000Z',
              tickers: [],
            },
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
    expect(launchLinks[0]!.className).toContain('bg-[var(--scoop-orange)]');
    const readLinks = screen.getAllByRole('link', { name: /read story/i });
    expect(readLinks[0]!.getAttribute('href')).toBe('https://ft.com/new');

    vi.useRealTimers();
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
            {
              id: 'lead',
              headline: 'Lead story',
              sourceDomain: 'ft.com',
              url: 'https://ft.com/lead',
              publishedAt: new Date(now - 10 * 60_000).toISOString(),
              tickers: [],
            },
            {
              id: 'fresh',
              headline: 'Also fresh story',
              sourceDomain: 'cnbc.com',
              url: 'https://cnbc.com/fresh',
              publishedAt: new Date(now - 20 * 60_000).toISOString(),
              tickers: [],
            },
          ],
        }}
      />,
    );

    const badges = screen.getAllByTestId('news-freshness-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]!.textContent).toMatch(/Latest/i);
    expect(badges[1]!.textContent).toMatch(/New/i);
    expect(badges[1]!.getAttribute('data-freshness')).toBe('new');

    vi.useRealTimers();
  });

  it('shows empty state', () => {
    render(
      <NewsFeed
        initial={{
          status: 'empty',
          items: [],
          nextCursor: null,
          asOf: new Date().toISOString(),
          message: 'No stories yet.',
        }}
      />,
    );
    expect(screen.getAllByText('No stories yet.').length).toBeGreaterThanOrEqual(1);
  });

  it('shows gated state', () => {
    render(
      <NewsFeed
        initial={{
          status: 'gated',
          items: [],
          nextCursor: null,
          asOf: new Date().toISOString(),
          message: 'News display is not enabled yet.',
        }}
      />,
    );
    expect(screen.getByText('News display pending')).toBeTruthy();
  });
});
