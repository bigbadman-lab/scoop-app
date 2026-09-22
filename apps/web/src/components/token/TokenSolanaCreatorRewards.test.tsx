import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenSolanaCreatorRewards } from '@/components/token/TokenSolanaCreatorRewards';

const CREATOR = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const OTHER = 'So11111111111111111111111111111111111111112';

const sessionState = {
  authenticated: false,
  authMethod: null as 'siwe' | 'siws' | null,
  namespace: null as 'eip155' | 'solana' | null,
  address: null as string | null,
};

const shellState = {
  runtimeReady: true,
};

const useScoopWalletSessionMock = vi.fn(() => ({
  connected: sessionState.authenticated,
  authenticated: sessionState.authenticated,
  namespace: sessionState.namespace,
  address: sessionState.address,
  providerReady: false,
  authMethod: sessionState.authMethod,
  userId: null,
}));

vi.mock('@/lib/auth/use-scoop-wallet-session', () => ({
  useScoopWalletSession: () => useScoopWalletSessionMock(),
}));

vi.mock('@/components/auth/WalletShellProvider', () => ({
  useWalletShell: () => ({
    configured: true,
    runtimeReady: shellState.runtimeReady,
    activating: false,
    cookies: null,
    ensureRuntime: async () => {},
    takePendingIntent: () => null,
  }),
}));

describe('TokenSolanaCreatorRewards', () => {
  beforeEach(() => {
    shellState.runtimeReady = true;
    sessionState.authenticated = false;
    sessionState.authMethod = null;
    sessionState.namespace = null;
    sessionState.address = null;
    useScoopWalletSessionMock.mockClear();
  });

  it('renders informational block with /account CTA when signed out', () => {
    render(<TokenSolanaCreatorRewards creatorWallet={CREATOR} />);

    expect(screen.getByTestId('token-solana-creator-rewards')).toBeTruthy();
    expect(screen.getByText('Creator rewards')).toBeTruthy();
    expect(screen.getByTestId('token-solana-creator-rewards-copy').textContent).toMatch(
      /accrue to your Solana wallet/i,
    );
    const cta = screen.getByTestId('token-solana-creator-rewards-cta');
    expect(cta.getAttribute('href')).toBe('/account');
    expect(cta.textContent).toMatch(/Claim via account/i);
    expect(screen.getByTestId('token-solana-creator-rewards').getAttribute('data-creator-match')).toBe(
      'no',
    );
  });

  it('does not call wallet session hooks when wallet runtime is not ready', () => {
    shellState.runtimeReady = false;
    render(<TokenSolanaCreatorRewards creatorWallet={CREATOR} />);

    expect(useScoopWalletSessionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('token-solana-creator-rewards-cta').textContent).toMatch(
      /Claim via account/i,
    );
    expect(screen.getByTestId('token-solana-creator-rewards').getAttribute('data-creator-match')).toBe(
      'no',
    );
  });

  it('uses Claim creator fees when SIWS session matches creator', () => {
    sessionState.authenticated = true;
    sessionState.authMethod = 'siws';
    sessionState.namespace = 'solana';
    sessionState.address = CREATOR;

    render(<TokenSolanaCreatorRewards creatorWallet={CREATOR} />);

    const cta = screen.getByTestId('token-solana-creator-rewards-cta');
    expect(cta.getAttribute('href')).toBe('/account');
    expect(cta.textContent).toMatch(/Claim creator fees/i);
    expect(screen.getByTestId('token-solana-creator-rewards').getAttribute('data-creator-match')).toBe(
      'yes',
    );
  });

  it('stays informational when SIWS wallet is not the creator', () => {
    sessionState.authenticated = true;
    sessionState.authMethod = 'siws';
    sessionState.namespace = 'solana';
    sessionState.address = OTHER;

    render(<TokenSolanaCreatorRewards creatorWallet={CREATOR} />);

    expect(screen.getByTestId('token-solana-creator-rewards-cta').textContent).toMatch(
      /Claim via account/i,
    );
    expect(screen.getByTestId('token-solana-creator-rewards').getAttribute('data-creator-match')).toBe(
      'no',
    );
  });
});
