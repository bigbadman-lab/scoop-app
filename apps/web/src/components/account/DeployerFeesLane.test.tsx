import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeployerFeesLane } from '@/components/account/DeployerFeesLane';

describe('DeployerFeesLane', () => {
  it('shows automatic payout messaging and 4% share without a Claim CTA', () => {
    render(
      <DeployerFeesLane
        assets={[
          {
            assetKind: 'eth',
            assetAddress: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            amountRaw: '420000000000000',
            amountDisplay: '0.00042',
          },
        ]}
      />,
    );

    expect(screen.getByText('Deployer fees')).toBeTruthy();
    expect(screen.getByText(/4% of gross trading fees/i)).toBeTruthy();
    expect(screen.getByText('Paid automatically')).toBeTruthy();
    expect(
      screen.getByText(/sent directly to the deployer wallet/i),
    ).toBeTruthy();
    expect(screen.getByText(/0\.00042/)).toBeTruthy();
    expect(screen.getByText('earned')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
    expect(screen.queryByText(/claimable/i)).toBeNull();
  });

  it('shows empty earned state without inventing balances', () => {
    render(<DeployerFeesLane assets={[]} />);
    expect(screen.getByText('No deployer fees earned yet.')).toBeTruthy();
    expect(screen.getByText('Paid automatically')).toBeTruthy();
    expect(screen.queryByText('earned')).toBeNull();
  });
});
