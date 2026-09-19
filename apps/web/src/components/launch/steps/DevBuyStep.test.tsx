import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DevBuyStep } from '@/components/launch/steps/DevBuyStep';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';
import { createInitialLaunchState } from '@/lib/launch/types';
import { INITIAL_LAUNCH_TX_STATE } from '@/lib/launch/tx-state';
import { DEV_SUPPLY_OPTIONS } from '@/lib/launch/dev-supply-policy';

describe('Dev Supply selector', () => {
  it('shows five options, defaults to 6 Months, and warns only for burn', () => {
    const onPatch = vi.fn();
    const { rerender } = render(
      <DevBuyStep
        state={createInitialLaunchState()}
        errors={{}}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByTestId('dev-supply-options').querySelectorAll('input').length).toBe(5);
    expect((screen.getByTestId('dev-supply-lock_6m') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('dev-supply-helper').textContent).toBe(
      DEV_SUPPLY_OPTIONS[3]!.helper,
    );
    expect(screen.queryByTestId('dev-supply-burn-warning')).toBeNull();
    expect(screen.getByTestId('dev-buy-funding').textContent).toMatch(/HoodLock fee/i);

    fireEvent.click(screen.getByTestId('dev-supply-burn'));
    expect(onPatch).toHaveBeenCalledWith({ devSupplyPolicy: 'burn' });

    rerender(
      <DevBuyStep
        state={{ ...createInitialLaunchState(), devSupplyPolicy: 'burn' }}
        errors={{}}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByTestId('dev-supply-burn-warning').textContent).toBe(
      'Permanent and irreversible.',
    );
    expect(screen.getByTestId('dev-buy-funding').textContent).toMatch(/not charged/i);
  });

  it('offers only 1% and 2%, defaulting to 1%', () => {
    const onPatch = vi.fn();
    const { rerender } = render(
      <DevBuyStep
        state={createInitialLaunchState()}
        errors={{}}
        onPatch={onPatch}
      />,
    );
    const options = screen.getByTestId('creator-fee-options').querySelectorAll('input');
    expect(options.length).toBe(2);
    expect(screen.getByTestId('creator-fee-options').textContent).not.toMatch(/0%/);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect((screen.getByTestId('creator-fee-100') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('creator-fee-helper').textContent).toMatch(
      /creator wallet receives the selected creator fee/i,
    );

    fireEvent.click(screen.getByTestId('creator-fee-200'));
    expect(onPatch).toHaveBeenCalledWith({ creatorFeeBps: 200 });

    rerender(
      <DevBuyStep
        state={{ ...createInitialLaunchState(), creatorFeeBps: 200 }}
        errors={{}}
        onPatch={onPatch}
      />,
    );
    expect((screen.getByTestId('creator-fee-200') as HTMLInputElement).checked).toBe(true);
  });

  it('review copy follows the selected policy', () => {
    const locked = createInitialLaunchState();
    locked.devBuyAmount = '0.05';
    const { rerender } = render(
      <ReviewStep
        state={locked}
        connectedAddress={null}
        tx={INITIAL_LAUNCH_TX_STATE}
      />,
    );
    expect(screen.getByTestId('dev-supply-summary').textContent).toContain('6 Month Lock');
    expect(screen.getByTestId('creator-fee-review').textContent).toContain('Creator Fee: 1%');
    expect(screen.getByTestId('dev-supply-funding').textContent).toMatch(/HoodLock fee/i);

    rerender(
      <ReviewStep
        state={{ ...locked, devSupplyPolicy: 'burn' }}
        connectedAddress={null}
        tx={INITIAL_LAUNCH_TX_STATE}
      />,
    );
    expect(screen.getByTestId('dev-supply-summary').textContent).toContain('Burned');
    expect(screen.getByTestId('creator-fee-review').textContent).toContain('Creator Fee: 1%');
    expect(screen.getByTestId('dev-supply-review-detail').textContent).toBe(
      'Your full dev allocation will be permanently sent to the burn address after launch.',
    );
    expect(screen.getByTestId('dev-supply-funding').textContent).not.toMatch(
      /HoodLock fee \+/,
    );

    rerender(
      <ReviewStep
        state={{ ...locked, creatorFeeBps: 200, devSupplyPolicy: 'lock_6m' }}
        connectedAddress={null}
        tx={INITIAL_LAUNCH_TX_STATE}
      />,
    );
    expect(screen.getByTestId('creator-fee-review').textContent).toContain('Creator Fee: 2%');
    expect(screen.getByTestId('dev-supply-summary').textContent).toContain('6 Month Lock');

    rerender(
      <ReviewStep
        state={locked}
        connectedAddress={null}
        tx={{ ...INITIAL_LAUNCH_TX_STATE, persistedCreatorTaxBps: 0, txHash: '0x' + 'ab'.repeat(32) }}
      />,
    );
    expect(screen.getByTestId('creator-fee-review').textContent).toContain('Creator Fee: 0%');
  });
});
