import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  clearAuthoritativeWalletNamespace,
  clearScoopAuthSnapshot,
  setAuthoritativeWalletNamespace,
  setScoopAuthSnapshot,
} from '@/lib/auth/wallet-session';

const SOL = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const USER = '11111111-1111-4111-8111-111111111111';

const { useAccount, fetchScoopAuthStatus, signOutScoopSession } = vi.hoisted(
  () => ({
    useAccount: vi.fn(),
    fetchScoopAuthStatus: vi.fn(),
    signOutScoopSession: vi.fn(),
  }),
);

let solanaAppKitAccount = {
  address: undefined as string | undefined,
  isConnected: false,
};

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: vi.fn() }),
  useAppKitAccount: (opts?: { namespace?: string }) => {
    if (opts?.namespace === 'solana') return solanaAppKitAccount;
    return { embeddedWalletInfo: undefined };
  },
  useAppKitProvider: () => ({
    walletProvider: solanaAppKitAccount.isConnected ? {} : undefined,
  }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));

vi.mock('@/lib/auth/siwe-session-client', () => ({
  fetchScoopAuthStatus: (...args: unknown[]) => fetchScoopAuthStatus(...args),
  requestSiweSession: vi.fn(),
}));

vi.mock('@/lib/auth/scoop-auth-events', () => ({
  signOutScoopSession: (...args: unknown[]) => signOutScoopSession(...args),
  publishScoopProfileUpdate: vi.fn(),
}));

vi.mock('@reown/appkit-controllers', () => ({
  ConnectionController: { disconnect: vi.fn().mockResolvedValue(undefined) },
}));

import { AccountPageLive } from '@/components/account/AccountPageLive';

describe('AccountPageLive Solana SIWS session', () => {
  beforeEach(() => {
    clearAuthoritativeWalletNamespace();
    clearScoopAuthSnapshot();
    useAccount.mockReset();
    fetchScoopAuthStatus.mockReset();
    signOutScoopSession.mockReset();
    solanaAppKitAccount = { address: SOL, isConnected: true };
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    signOutScoopSession.mockResolvedValue(true);
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
  });

  it('renders the shared account layout with the Solana public key', () => {
    const userId = USER;
    setAuthoritativeWalletNamespace('solana');
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId,
    });
    render(<AccountPageLive />);
    expect(screen.getByText('Your SCOOP profile')).toBeTruthy();
    expect(screen.getByText('SCOOP account')).toBeTruthy();
    expect(screen.getByText('Connected wallet')).toBeTruthy();
    expect(screen.getByTestId('account-wallet-address').textContent).toBe(SOL);
    expect(screen.getByText(/External wallet · Solana/)).toBeTruthy();
    expect(screen.getByText('Sign out of SCOOP')).toBeTruthy();
    expect(screen.getByTestId('solana-modules-unavailable').textContent).toMatch(
      /Not available on Solana yet/i,
    );
    expect(screen.queryByText(/Could not load account/i)).toBeNull();
  });

  it('signs out from the shared account action', async () => {
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
    });
    render(<AccountPageLive />);
    screen.getByRole('button', { name: /sign out of scoop/i }).click();
    await waitFor(() => {
      expect(signOutScoopSession).toHaveBeenCalled();
    });
  });
});
