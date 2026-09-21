import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  clearAuthoritativeWalletNamespace,
  setAuthoritativeWalletNamespace,
} from '@/lib/auth/wallet-session';

const SOL = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';

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

describe('AccountPageLive Solana session', () => {
  beforeEach(() => {
    clearAuthoritativeWalletNamespace();
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

  it('renders Solana public key and network label without EVM crash', async () => {
    setAuthoritativeWalletNamespace('solana');
    render(<AccountPageLive />);
    expect(await screen.findByTestId('solana-account-session')).toBeTruthy();
    expect(screen.getByTestId('solana-account-address').textContent).toBe(SOL);
    expect(screen.getByText(/^Solana$/)).toBeTruthy();
    expect(screen.getByTestId('solana-account-evm-unavailable').textContent).toMatch(
      /Not available for this wallet/i,
    );
    expect(screen.getByTestId('solana-account-sign-out')).toBeTruthy();
  });

  it('signs out and clears the Solana session surface', async () => {
    setAuthoritativeWalletNamespace('solana');
    render(<AccountPageLive />);
    await screen.findByTestId('solana-account-sign-out');
    screen.getByTestId('solana-account-sign-out').click();
    await waitFor(() => {
      expect(signOutScoopSession).toHaveBeenCalled();
    });
  });
});
