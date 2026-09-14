import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoopWalletConnect } from '@/components/auth/ScoopWalletConnect';

const useAppKitWallets = vi.fn();
const useAccount = vi.fn();

vi.mock('@reown/appkit/react', () => ({
  useAppKitWallets: () => useAppKitWallets(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
}));

vi.mock('@/components/auth/ScoopWcQr', () => ({
  ScoopWcQr: ({ uri }: { uri: string }) => (
    <div data-testid="scoop-wc-qr">{uri}</div>
  ),
}));

describe('ScoopWalletConnect', () => {
  beforeEach(() => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
  });

  it('shows safe empty/not-enabled state when headless wallets unavailable', () => {
    useAppKitWallets.mockReturnValue({
      wallets: [],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: false,
      wcUri: undefined,
      connectingWallet: undefined,
      connect: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        connecting={false}
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.getByText(/wallet list is unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/not enabled yet/i)).toBeNull();
  });

  it('renders populated wallets and connect action', async () => {
    const connect = vi.fn(async () => undefined);
    useAppKitWallets.mockReturnValue({
      wallets: [
        { id: 'metamask', name: 'MetaMask' },
        { id: 'trust', name: 'Trust Wallet' },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect,
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        connecting={false}
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.getByText('MetaMask')).toBeTruthy();
    screen.getByText('MetaMask').closest('button')?.click();
    expect(connect).toHaveBeenCalled();
  });

  it('shows WC QR primary UX with copy URI secondary', () => {
    useAppKitWallets.mockReturnValue({
      wallets: [{ id: 'wc', name: 'WalletConnect' }],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: 'wc:example-uri',
      connectingWallet: { id: 'wc', name: 'WalletConnect' },
      connect: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        connecting
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.getByTestId('scoop-wc-qr')).toBeTruthy();
    expect(screen.getByText(/copy uri/i)).toBeTruthy();
    expect(screen.getByText(/open wallet/i)).toBeTruthy();
  });

  it('shows retry when initialized but wallet list empty', () => {
    const fetchWallets = vi.fn();
    useAppKitWallets.mockReturnValue({
      wallets: [],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect: vi.fn(),
      fetchWallets,
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        connecting={false}
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.getByText(/no wallets were discovered/i)).toBeTruthy();
    screen.getByText(/retry wallet list/i).click();
    expect(fetchWallets).toHaveBeenCalled();
  });
});
