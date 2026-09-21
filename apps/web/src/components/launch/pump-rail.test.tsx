import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';
import { LaunchRailSelector } from '@/components/launch/LaunchRailSelector';
import { PumpRouteStep } from '@/components/launch/PumpRouteStep';
import { createInitialLaunchState } from '@/lib/launch/types';
import { INITIAL_LAUNCH_TX_STATE } from '@/lib/launch/tx-state';
import { pumpLaunchResult } from '@/lib/launch/launch-result';
import {
  pumpFunCoinUrl,
  solanaExplorerTxUrl,
} from '@/lib/solana/explorer';

const { openAppKit, requestScoopConnect, useAppKitAccount } = vi.hoisted(() => ({
  openAppKit: vi.fn(),
  requestScoopConnect: vi.fn(),
  useAppKitAccount: vi.fn(),
}));

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: openAppKit }),
  useAppKitAccount: (opts?: { namespace?: string }) => useAppKitAccount(opts),
}));

vi.mock('@/lib/auth/open-scoop-auth', () => ({
  requestScoopConnect: (...args: unknown[]) => requestScoopConnect(...args),
}));

const SOL = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const MINT = 'So11111111111111111111111111111111111111112';
const SIG = '5'.repeat(64);

describe('LaunchRailSelector', () => {
  it('renders both rails with icons and marks the selected provider', () => {
    const onChange = vi.fn();
    render(
      <LaunchRailSelector
        value={{ chain: 'robinhood', provider: 'pons' }}
        onChange={onChange}
      />,
    );
    const pons = screen.getByTestId('launch-rail-pons');
    const pump = screen.getByTestId('launch-rail-pump');
    expect(pons.getAttribute('aria-pressed')).toBe('true');
    expect(pump.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Robinhood Chain')).toBeTruthy();
    expect(screen.getByText('Launch via Pons')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('Launch via Pump.fun')).toBeTruthy();
    expect(pons.querySelector('img')?.getAttribute('src')).toBe('/brand/rh.svg');
    expect(pump.querySelector('img')?.getAttribute('src')).toBe('/brand/solana.svg');
  });
});

describe('PumpRouteStep Solana connect', () => {
  beforeEach(() => {
    openAppKit.mockReset();
    requestScoopConnect.mockReset();
    useAppKitAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
  });

  it('requests Solana namespace connect and does not open bare EVM Connect', () => {
    render(<PumpRouteStep />);
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.getByTestId('pump-connect-solana').textContent).toMatch(
      /Connect Solana/i,
    );
    screen.getByTestId('pump-connect-solana').click();
    expect(requestScoopConnect).toHaveBeenCalledTimes(1);
    const [, opts] = requestScoopConnect.mock.calls[0]!;
    expect(opts).toEqual({ namespace: 'solana' });
  });

  it('shows Solana address when connected and ignores EVM-only state', () => {
    useAppKitAccount.mockReturnValue({
      address: SOL,
      isConnected: true,
    });
    render(<PumpRouteStep />);
    expect(screen.getByTestId('pump-solana-address').textContent).toMatch(
      /2Q3bW/,
    );
    expect(screen.queryByText(/0x/i)).toBeNull();
  });
});

describe('ReviewStep Pump rail', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows Pump summary and hides Pons / HoodLock fields', () => {
    const state = createInitialLaunchState({
      launchRail: { chain: 'solana', provider: 'pump' },
      name: 'Gate D Coin',
      ticker: 'GATED',
      description: 'Pump create only',
      image: {
        ...createInitialLaunchState().image,
        previewUrl: 'blob:preview',
      },
    });
    render(
      <ReviewStep
        state={state}
        connectedAddress={null}
        solanaAddress={SOL}
        tx={INITIAL_LAUNCH_TX_STATE}
      />,
    );
    expect(screen.getByTestId('pump-launch-summary').textContent).toMatch(
      /Pump\.fun/,
    );
    expect(screen.getByTestId('pump-launch-summary').textContent).toMatch(
      /Initial buy.*None/s,
    );
    expect(screen.queryByTestId('pons-launch-summary')).toBeNull();
    expect(screen.queryByTestId('dev-supply-summary')).toBeNull();
    expect(screen.getByTestId('pump-creator-wallet').textContent).toMatch(/2Q3bW/);
  });

  it('shows temporary Pump success with mint + explorer + pump.fun links', () => {
    const state = createInitialLaunchState({
      launchRail: { chain: 'solana', provider: 'pump' },
      name: 'Gate D Coin',
      ticker: 'GATED',
    });
    const result = pumpLaunchResult({ mint: MINT, signature: SIG });
    render(
      <ReviewStep
        state={state}
        connectedAddress={null}
        solanaAddress={SOL}
        tx={{ ...INITIAL_LAUNCH_TX_STATE, phase: 'receipt_success', txHash: SIG }}
        pumpResult={result}
      />,
    );
    expect(screen.getByTestId('pump-launch-success')).toBeTruthy();
    expect(screen.getByTestId('pump-fun-link').getAttribute('href')).toBe(
      pumpFunCoinUrl(MINT),
    );
    expect(screen.getByTestId('pump-explorer-tx').getAttribute('href')).toBe(
      solanaExplorerTxUrl(SIG),
    );
  });
});
