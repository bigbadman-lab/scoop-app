import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenScoopSupport } from '@/components/token/TokenScoopSupport';

describe('TokenScoopSupport', () => {
  it('hides when buy count is zero', () => {
    const { container } = render(
      <TokenScoopSupport buyCount={0} totalSol="0" buys={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders factual support summary and history', () => {
    render(
      <TokenScoopSupport
        buyCount={3}
        totalSol="0.77"
        nowMs={1_700_000_000_000}
        buys={[
          {
            signature: '5'.repeat(64),
            eventIndex: 0,
            solAmount: '0.42',
            solAmountLamports: '420000000',
            tokenAmountRaw: '1',
            blockTime: 1_700_000_000 - 120,
          },
          {
            signature: '6'.repeat(64),
            eventIndex: 0,
            solAmount: '0.20',
            solAmountLamports: '200000000',
            tokenAmountRaw: '1',
            blockTime: 1_700_000_000 - 1080,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('token-scoop-support')).toBeTruthy();
    expect(screen.getByText('SCOOP SUPPORT')).toBeTruthy();
    expect(screen.getByText(/SCOOP has bought this market/i)).toBeTruthy();
    expect(screen.getByTestId('token-scoop-support-total').textContent).toMatch(/0\.77 SOL/);
    expect(screen.getByTestId('token-scoop-support-count').textContent).toMatch(/3 purchases/);
    expect(screen.getAllByTestId('token-scoop-support-buy-link')).toHaveLength(2);
    expect(screen.queryByText(/guaranteed|price support|safe/i)).toBeNull();
  });
});
