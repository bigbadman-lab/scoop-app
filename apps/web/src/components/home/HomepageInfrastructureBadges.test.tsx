import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomepageInfrastructureBadges } from '@/components/home/HomepageInfrastructureBadges';
import { PlatformBadge } from '@/components/home/PlatformBadge';

describe('PlatformBadge', () => {
  it('renders eyebrow and value', () => {
    render(
      <PlatformBadge icon={<span data-testid="icon" />} eyebrow="Built on" value="Solana" />,
    );
    expect(screen.getByText('Built on')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});

describe('HomepageInfrastructureBadges', () => {
  it('renders dual-rail badges with Solana, Pump.fun, Robinhood Chain, and Pons assets', () => {
    render(<HomepageInfrastructureBadges />);

    expect(screen.getByTestId('homepage-infrastructure-badges')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('Pump.fun')).toBeTruthy();
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByText('Pons')).toBeTruthy();
    expect(screen.getAllByText('Built on')).toHaveLength(2);
    expect(screen.getAllByText('Launch via')).toHaveLength(2);

    const solana = screen.getByTestId('platform-badge-solana-icon');
    expect(solana.querySelector('img')?.getAttribute('src')).toBe('/brand/solana.svg');

    const pump = screen.getByTestId('platform-badge-pump-icon');
    expect(pump.querySelector('img')?.getAttribute('src')).toBe('/brand/pump.svg');
    expect(pump.querySelector('img')?.className).toMatch(/object-contain/);

    const rh = screen.getByTestId('platform-badge-rh-icon');
    expect(rh.className).toMatch(/overflow-hidden/);
    expect(rh.querySelector('img')?.getAttribute('src')).toBe('/brand/rh.svg');

    expect(screen.getByTestId('platform-badge-pons-icon')).toBeTruthy();
    expect(screen.getAllByTestId('platform-badge')).toHaveLength(4);
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
