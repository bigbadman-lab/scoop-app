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
    expect(screen.getByTestId('dev-supply-funding').textContent).toMatch(/HoodLock fee/i);

    rerender(
      <ReviewStep
        state={{ ...locked, devSupplyPolicy: 'burn' }}
        connectedAddress={null}
        tx={INITIAL_LAUNCH_TX_STATE}
      />,
    );
    expect(screen.getByTestId('dev-supply-summary').textContent).toContain('Burned');
    expect(screen.getByTestId('dev-supply-review-detail').textContent).toBe(
      'Your full dev allocation will be permanently sent to the burn address after launch.',
    );
    expect(screen.getByTestId('dev-supply-funding').textContent).not.toMatch(
      /HoodLock fee \+/,
    );
  });
});
