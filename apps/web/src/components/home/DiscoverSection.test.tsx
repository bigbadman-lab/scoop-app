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
  it('defaults to trending deferred state and switches empty copy', () => {
    render(
      <DiscoverSection
        initialTab="trending"
        initialResult={trending}
        preloaded={{ trending, new: emptyNew }}
        catalogue={[]}
      />,
    );

    expect(screen.getByTestId('discover-empty').textContent).toMatch(/trending ranking/i);
    fireEvent.click(screen.getByTestId('discover-tab-new'));
    expect(screen.getByTestId('discover-empty').textContent).toMatch(/nothing new yet/i);
  });

  it('does not fabricate production token rows', () => {
    render(
      <DiscoverSection
        initialTab="trending"
        initialResult={trending}
        preloaded={{ trending }}
        catalogue={[]}
      />,
    );
    expect(screen.queryByTestId('discover-grid')).toBeNull();
  });
});
