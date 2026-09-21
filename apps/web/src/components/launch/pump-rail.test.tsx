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
import {
  EVM_ON_PUMP_MESSAGE,
  SIGN_IN_TO_LAUNCH_MESSAGE,
} from '@/lib/launch/rail-compatibility';

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

describe('PumpRouteStep global session', () => {
  const signedOut = {
    status: 'requires_sign_in' as const,
    message: SIGN_IN_TO_LAUNCH_MESSAGE,
    canLaunch: false,
  };

  it('shows passive Sign In copy and no local connect / switch controls', () => {
    render(<PumpRouteStep compatibility={signedOut} />);
    expect(screen.getByTestId('launch-wallet-notice').textContent).toMatch(
      /Sign in from the top-right/i,
    );
    expect(screen.queryByTestId('pump-connect-solana')).toBeNull();
    expect(screen.queryByTestId('launch-global-sign-in')).toBeNull();
    expect(screen.queryByTestId('launch-switch-wallet')).toBeNull();
    expect(screen.queryByText(/Connect Solana/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });

  it('shows the Solana address when the global session is compatible', () => {
    render(
      <PumpRouteStep
        compatibility={{ status: 'compatible', message: null, canLaunch: true }}
        solanaAddress={SOL}
      />,
    );
    expect(screen.getByTestId('pump-solana-address').textContent).toMatch(
      /2Q3bW/,
    );
    expect(screen.queryByTestId('pump-connect-solana')).toBeNull();
  });

  it('blocks an Ethereum session with passive copy and no switch button', () => {
    render(
      <PumpRouteStep
        compatibility={{
          status: 'incompatible_namespace',
          message: EVM_ON_PUMP_MESSAGE,
          canLaunch: false,
        }}
      />,
    );
    expect(screen.getByTestId('launch-wallet-notice').textContent).toMatch(
      /Ethereum wallet/i,
    );
    expect(screen.getByTestId('launch-wallet-notice').textContent).toMatch(
      /top-right/i,
    );
    expect(screen.queryByTestId('pump-connect-solana')).toBeNull();
    expect(screen.queryByTestId('launch-switch-wallet')).toBeNull();
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
