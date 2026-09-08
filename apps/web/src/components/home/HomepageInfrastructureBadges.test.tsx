import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomepageInfrastructureBadges } from '@/components/home/HomepageInfrastructureBadges';
import { PlatformBadge } from '@/components/home/PlatformBadge';

describe('PlatformBadge', () => {
  it('renders eyebrow and value', () => {
    render(
      <PlatformBadge icon={<span data-testid="icon" />} eyebrow="Built on" value="Robinhood Chain" />,
    );
    expect(screen.getByText('Built on')).toBeTruthy();
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});

describe('HomepageInfrastructureBadges', () => {
  it('renders all three badges with exact labels and brand assets', () => {
    render(<HomepageInfrastructureBadges />);

    expect(screen.getByTestId('homepage-infrastructure-badges')).toBeTruthy();
    expect(screen.getByText('Built on')).toBeTruthy();
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByText('Powered by')).toBeTruthy();
    expect(screen.getByText('Uniswap')).toBeTruthy();
    expect(screen.getByText('Markets paired with')).toBeTruthy();
    expect(screen.getByText('Stocks + ETH')).toBeTruthy();

    const rh = screen.getByTestId('platform-badge-rh-icon');
    expect(rh.className).toMatch(/overflow-hidden/);
    expect(rh.className).toMatch(/rounded-\[7px\]/);
    expect(rh.className).toMatch(/sm:rounded-\[9px\]/);
    const rhImg = rh.querySelector('img');
    expect(rhImg?.getAttribute('src')).toBe('/brand/rh.svg');

    const uni = screen.getByTestId('platform-badge-uni-icon');
    const uniImg = uni.querySelector('img');
    expect(uniImg?.getAttribute('src')).toBe('/brand/uni.svg');
    expect(uniImg?.className).toMatch(/object-contain/);

    expect(screen.getAllByTestId('platform-badge')).toHaveLength(3);
  });

  it('keeps badges on one non-wrapping row for mobile viewports', () => {
    render(<HomepageInfrastructureBadges />);
    const row = screen.getByTestId('homepage-infrastructure-badges');
    expect(row.className).toMatch(/flex/);
    expect(row.className).toMatch(/flex-nowrap/);
    expect(row.className).not.toMatch(/flex-wrap/);
    for (const badge of screen.getAllByTestId('platform-badge')) {
      expect(badge.className).toMatch(/min-w-0/);
      expect(badge.className).toMatch(/flex-1/);
    }
  });
});
