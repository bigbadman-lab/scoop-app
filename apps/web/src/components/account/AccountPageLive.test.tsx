import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  clearAuthoritativeWalletNamespace,
  clearScoopAuthSnapshot,
  setAuthoritativeWalletNamespace,
  setScoopAuthSnapshot,
} from '@/lib/auth/wallet-session';

const SOL = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
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

function solanaAccountResponse(tokensLaunched: unknown[] = []) {
  return {
    authenticated: true,
    user: {
      id: USER,
      joinedAt: '2026-03-20T00:00:00.000Z',
      profile: {
        displayName: null,
        avatarUrl: 'data:image/svg+xml;base64,abc',
      },
    },
    wallet: {
      address: SOL,
      walletType: 'external',
      provider: null,
      chainId: 900001,
      chainLabel: 'Solana',
    },
    auth: {
      scoopSession: true,
      onChain: {
        mayBroadcastOnChain: false,
        reason: 'unsigned',
        message: 'Not available on Solana yet',
      },
    },
    tokensLaunched,
    fees: {
      deployer: { assets: [], empty: true },
      creator: { assets: [], empty: true },
    },
  };
}

describe('AccountPageLive Solana SIWS session', () => {
  beforeEach(() => {
    clearAuthoritativeWalletNamespace();
    clearScoopAuthSnapshot();
    useAccount.mockReset();
    fetchScoopAuthStatus.mockReset();
    signOutScoopSession.mockReset();
    solanaAppKitAccount = { address: SOL, isConnected: true };
    signOutScoopSession.mockResolvedValue(true);
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(solanaAccountResponse()),
      ),
    );
  });

  it('loads /api/account and renders the Solana public key', async () => {
    setAuthoritativeWalletNamespace('solana');
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
      chainId: 101,
    });

    render(<AccountPageLive />);

    await waitFor(() => {
      expect(screen.getByTestId('account-wallet-address').textContent).toBe(SOL);
    });
    expect(screen.getByText('Your SCOOP profile')).toBeTruthy();
    expect(screen.getByText(/External wallet · Solana/)).toBeTruthy();
    expect(screen.getByTestId('solana-modules-unavailable').textContent).toMatch(
      /Not available on Solana yet/i,
    );
    expect(screen.getByText('No markets launched yet.')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/account',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('renders Pump launches returned for the SIWS session', async () => {
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
      chainId: 101,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          solanaAccountResponse([
            {
              tokenAddress: MINT,
              name: 'Scoop Pump Canary',
              symbol: 'SCPY',
              imageUri: null,
              displayImageUrl: 'https://cdn.example/scpy.png',
              quoteAsset: 'So11111111111111111111111111111111111111112',
              launchedAt: '2026-03-20T12:00:00.000Z',
              launchComplete: false,
              href: `/token/${MINT}`,
              chainId: 900001,
              network: 'Solana',
            },
          ]),
        ),
      ),
    );

    render(<AccountPageLive />);

    await waitFor(() => {
      expect(screen.getByText('Scoop Pump Canary')).toBeTruthy();
    });
    expect(screen.getByText(/\$SCPY/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view/i }).getAttribute('href')).toBe(
      `/token/${MINT}`,
    );
    expect(screen.queryByText('No markets launched yet.')).toBeNull();
  });

  it('signs out from the shared account action', async () => {
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      namespace: 'solana',
      address: SOL,
      authMethod: 'siws',
      userId: USER,
      chainId: 101,
    });

    render(<AccountPageLive />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out of scoop/i })).toBeTruthy();
    });
    screen.getByRole('button', { name: /sign out of scoop/i }).click();
    await waitFor(() => {
      expect(signOutScoopSession).toHaveBeenCalled();
    });
  });
});
