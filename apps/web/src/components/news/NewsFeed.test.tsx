import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsFeed } from '@/components/news/NewsFeed';

describe('NewsFeed', () => {
  it('renders chronological items without create-from-story', () => {
    render(
      <NewsFeed
        initial={{
          status: 'ok',
          asOf: new Date().toISOString(),
          nextCursor: null,
          items: [
            {
              id: '2',
              headline: 'Newer story',
              sourceDomain: 'ft.com',
              url: 'https://ft.com/new',
              publishedAt: new Date().toISOString(),
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
    const launchLinks = screen.getAllByRole('link', { name: /launch as token/i });
    expect(launchLinks).toHaveLength(2);
    expect(launchLinks[0]!.getAttribute('href')).toBe('/news/2/launch');
    expect(launchLinks[1]!.getAttribute('href')).toBe('/news/1/launch');
    expect(launchLinks[0]!.className).not.toContain('bg-[var(--scoop-orange)]');
    const readLinks = screen.getAllByRole('link', { name: /read story/i });
    expect(readLinks[0]!.getAttribute('href')).toBe('https://ft.com/new');
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
