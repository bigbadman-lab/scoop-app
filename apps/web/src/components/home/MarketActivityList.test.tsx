import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketActivityList } from '@/components/home/MarketActivityList';

describe('MarketActivityList empty state', () => {
  it('renders intentional empty copy without mock rows', () => {
    render(
      <MarketActivityList
        activity={{
          status: 'empty',
          items: [],
          message: 'No live market activity yet.',
          deferredUnifiedFeed: true,
        }}
        catalogue={[]}
      />,
    );
    expect(screen.getByTestId('activity-empty').textContent).toMatch(/no live market activity/i);
  });
});
