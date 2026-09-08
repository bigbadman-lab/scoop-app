import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiscoverSection } from '@/components/home/DiscoverSection';
import type { DiscoverTabResult } from '@/lib/discovery/load-home';

const trending: DiscoverTabResult = {
  tabId: 'trending',
  status: 'unavailable',
  items: [],
  message: 'Trending ranking is not available yet.',
};

const emptyNew: DiscoverTabResult = {
  tabId: 'new',
  status: 'empty',
  items: [],
  message: 'Nothing new yet.',
};

describe('DiscoverSection', () => {
  it('defaults to NEW and can switch to trending deferred empty copy', () => {
    render(
      <DiscoverSection
        initialTab="new"
        initialResult={emptyNew}
        preloaded={{ trending, new: emptyNew }}
        catalogue={[]}
      />,
    );

    expect(screen.queryByText('Discover')).toBeNull();
    expect(screen.getByTestId('discover-empty').textContent).toMatch(/nothing new yet/i);
    fireEvent.click(screen.getByTestId('discover-tab-trending'));
    expect(screen.getByTestId('discover-empty').textContent).toMatch(/trending ranking/i);
  });

  it('does not fabricate production token rows', () => {
    render(
      <DiscoverSection
        initialTab="new"
        initialResult={emptyNew}
        preloaded={{ new: emptyNew }}
        catalogue={[]}
      />,
    );
    expect(screen.queryByTestId('discover-grid')).toBeNull();
  });
});
