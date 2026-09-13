import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  EarningsStep,
  HOLDER_REWARDS_HOURLY_COPY,
} from '@/components/launch/steps/EarningsStep';
import { createInitialLaunchState } from '@/lib/launch/types';
import {
  AdditionalFeeDestination,
  CreatorAllocationDestination,
} from '@scoop/shared';

describe('EarningsStep holder rewards hourly copy', () => {
  it('shows hourly explanation on the base allocation Holders option', () => {
    const onPatch = vi.fn();
    render(
      <EarningsStep
        state={createInitialLaunchState()}
        errors={{}}
        connectedAddress="0x1111111111111111111111111111111111111111"
        onMode={vi.fn()}
        onPatch={onPatch}
      />,
    );

    const copy = screen.getByTestId('base-holders-hourly-copy');
    expect(copy.textContent).toContain(HOLDER_REWARDS_HOURLY_COPY);
    expect(HOLDER_REWARDS_HOURLY_COPY).toBe(
      'Holder rewards are distributed hourly to eligible token holders.',
    );

    fireEvent.click(screen.getByRole('radio', { name: /Holders/i }));
    expect(onPatch).toHaveBeenCalledWith({
      creatorAllocationDestination: CreatorAllocationDestination.Holders,
    });
  });

  it('shows hourly explanation on the additional-fee Holders option', () => {
    const onPatch = vi.fn();
    render(
      <EarningsStep
        state={createInitialLaunchState({
          additionalFee: 10_000,
          additionalFeeDestination: AdditionalFeeDestination.Creator,
        })}
        errors={{}}
        connectedAddress="0x1111111111111111111111111111111111111111"
        onMode={vi.fn()}
        onPatch={onPatch}
      />,
    );

    const copy = screen.getByTestId('additional-holders-hourly-copy');
    expect(copy.textContent).toContain(HOLDER_REWARDS_HOURLY_COPY);

    const radios = screen.getAllByRole('radio', { name: /Holders/i });
    expect(radios.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(radios[radios.length - 1]!);
    expect(onPatch).toHaveBeenCalledWith({
      additionalFeeDestination: AdditionalFeeDestination.Holders,
    });
  });

  it('keeps Creator / Deployer options and does not invent fee percentages', () => {
    render(
      <EarningsStep
        state={createInitialLaunchState({ additionalFee: 10_000 })}
        errors={{}}
        connectedAddress="0x1111111111111111111111111111111111111111"
        onMode={vi.fn()}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Creator').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Deployer')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Base 1%/i })).toBeTruthy();
    expect(screen.getByTestId('additional-fee-value').textContent).toMatch(/\+1\.00%/);
    expect(screen.queryByText(/paid automatically every hour/i)).toBeNull();
    expect(screen.queryByText(/arrive in your wallet every hour/i)).toBeNull();
  });
});

describe('EarningsStep creator mode MVP gating', () => {
  const wallet = '0x1111111111111111111111111111111111111111';

  it('keeps wallet creator options available and selectable', () => {
    const onMode = vi.fn();
    render(
      <EarningsStep
        state={createInitialLaunchState({ creatorMode: 'connected' })}
        errors={{}}
        connectedAddress={wallet}
        onMode={onMode}
        onPatch={vi.fn()}
      />,
    );

    const connected = screen.getByRole('radio', { name: /My connected wallet/i });
    const custom = screen.getByRole('radio', { name: /Another wallet/i });
    expect((connected as HTMLButtonElement).disabled).toBe(false);
    expect((custom as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(custom);
    expect(onMode).toHaveBeenCalledWith('custom');
  });

  it('renders X creator as disabled with exact In development label', () => {
    const onMode = vi.fn();
    render(
      <EarningsStep
        state={createInitialLaunchState()}
        errors={{}}
        connectedAddress={wallet}
        onMode={onMode}
        onPatch={vi.fn()}
      />,
    );

    const xOption = screen.getByRole('radio', { name: /X account/i });
    expect((xOption as HTMLButtonElement).disabled).toBe(true);
    expect(xOption.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('In development')).toBeTruthy();
    expect(screen.queryByText('Not available')).toBeNull();

    fireEvent.click(xOption);
    expect(onMode).not.toHaveBeenCalled();
  });

  it('defaults MVP launch state to connected wallet creator mode', () => {
    const state = createInitialLaunchState();
    expect(state.creatorMode).toBe('connected');
  });
});
