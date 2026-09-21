import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkBadge, networkBadgeIdForToken } from '@/components/ui/NetworkBadge';

describe('NetworkBadge', () => {
  it('renders Solana with solana.svg and SOLANA label', () => {
    render(<NetworkBadge network="solana" />);
    const badge = screen.getByTestId('network-badge-solana');
    expect(badge.textContent).toMatch(/SOLANA/);
    const img = badge.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/brand/solana.svg');
  });

  it('renders RHC with rh.svg', () => {
    render(<NetworkBadge network="rhc" />);
    const badge = screen.getByTestId('network-badge-rhc');
    expect(badge.textContent).toMatch(/RHC/);
    expect(badge.querySelector('img')?.getAttribute('src')).toBe('/brand/rh.svg');
  });

  it('maps pump / 900001 to solana and 4663 to rhc', () => {
    expect(
      networkBadgeIdForToken({ chainId: 900001, marketSource: 'pump' }),
    ).toBe('solana');
    expect(
      networkBadgeIdForToken({ chainId: 4663, marketSource: 'scoop' }),
    ).toBe('rhc');
  });
});
