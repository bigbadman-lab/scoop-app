import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScoopWalletConnect } from '@/components/auth/ScoopWalletConnect';
import {
  ConnectorController,
  ConnectorControllerUtil,
} from '@reown/appkit-controllers';

const useAppKitWallets = vi.fn();
const useAccount = vi.fn();
const useAppKitAccount = vi.fn();

vi.mock('@reown/appkit/react', () => ({
  useAppKitWallets: () => useAppKitWallets(),
  useAppKitAccount: (opts?: { namespace?: string }) => useAppKitAccount(opts),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
}));

vi.mock('@reown/appkit-controllers', () => ({
  ChainController: {
    state: { activeChain: 'eip155' },
    switchActiveNamespace: vi.fn(async () => undefined),
    setActiveNamespace: vi.fn(),
  },
  ConnectorController: {
    setFilterByNamespace: vi.fn(),
    getConnectors: vi.fn(() => []),
    getConnector: vi.fn(() => undefined),
  },
  ConnectorControllerUtil: {
    connectExternal: vi.fn(async () => undefined),
  },
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
    useAppKitAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    vi.mocked(ConnectorController.getConnectors).mockReturnValue([]);
    vi.mocked(ConnectorController.getConnector).mockReturnValue(undefined);
    vi.mocked(ConnectorControllerUtil.connectExternal).mockClear();
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
      getWcUri: vi.fn(),
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

  it('renders populated wallets with fallback avatar when image missing', async () => {
    const connect = vi.fn(async () => undefined);
    useAppKitWallets.mockReturnValue({
      wallets: [
        { id: 'metamask', name: 'MetaMask', imageUrl: '' },
        {
          id: 'trust',
          name: 'Trust Wallet',
          imageUrl: 'https://cdn.example/trust.png',
        },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect,
      getWcUri: vi.fn(),
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
    expect(screen.getByText('ME')).toBeTruthy();
    expect(screen.getByAltText('')).toBeTruthy();
    screen.getByText('MetaMask').closest('button')?.click();
    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'metamask' }),
        'eip155',
      );
    });
  });

  it('filters out EVM-only wallets and connects with solana namespace', async () => {
    const connect = vi.fn(async () => undefined);
    useAppKitWallets.mockReturnValue({
      wallets: [
        {
          id: 'metamask',
          name: 'MetaMask',
          isInjected: true,
          connectors: [{ id: 'metamask', chain: 'eip155' }],
        },
        {
          id: 'phantom',
          name: 'Phantom',
          isInjected: true,
          connectors: [{ id: 'phantom', chain: 'solana' }],
        },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect,
      getWcUri: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        namespace="solana"
        connecting={false}
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.queryByText('MetaMask')).toBeNull();
    expect(screen.getByText('Phantom')).toBeTruthy();
    expect(screen.queryByText(/Loading Solana wallets/i)).toBeNull();
    screen.getByText('Phantom').closest('button')?.click();
    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'phantom' }),
        'solana',
      );
    });
  });

  it('connects Phantom via Solana WalletStandard connector, not Ethereum WC', async () => {
    const connect = vi.fn(async () => undefined);
    const phantomSolana = {
      id: 'Phantom',
      chain: 'solana',
      name: 'Phantom',
      type: 'ANNOUNCED',
    };
    vi.mocked(ConnectorController.getConnectors).mockReturnValue([
      phantomSolana,
    ] as never);
    useAppKitWallets.mockReturnValue({
      wallets: [
        {
          id: 'phantom',
          name: 'Phantom',
          isInjected: true,
          // Common failure mode: list only mapped the EVM injector
          connectors: [{ id: 'phantom', chain: 'eip155' }],
        },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect,
      getWcUri: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    render(
      <ScoopWalletConnect
        namespace="solana"
        connecting={false}
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={() => undefined}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(screen.getByText('Phantom')).toBeTruthy();
    screen.getByText('Phantom').closest('button')?.click();
    await waitFor(() => {
      expect(ConnectorControllerUtil.connectExternal).toHaveBeenCalledWith(
        phantomSolana,
      );
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('settles on Solana AppKit account, not wagmi EVM address', () => {
    const onConnected = vi.fn();
    useAppKitWallets.mockReturnValue({
      wallets: [
        {
          id: 'phantom',
          name: 'Phantom',
          isInjected: true,
          connectors: [{ id: 'phantom', chain: 'solana' }],
        },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect: vi.fn(),
      getWcUri: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });
    useAccount.mockReturnValue({
      address: '0xabc',
      isConnected: true,
      status: 'connected',
    });
    useAppKitAccount.mockReturnValue({
      address: '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      isConnected: true,
    });

    render(
      <ScoopWalletConnect
        namespace="solana"
        connecting
        error={null}
        onBack={() => undefined}
        onConnecting={() => undefined}
        onConnected={onConnected}
        onCancelled={() => undefined}
        onFailed={() => undefined}
      />,
    );

    expect(onConnected).toHaveBeenCalledWith(
      '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
    );
    expect(onConnected).not.toHaveBeenCalledWith('0xabc');
  });

  it('does not render img for undefined asset imageUrl', () => {
    useAppKitWallets.mockReturnValue({
      wallets: [
        {
          id: 'x',
          name: 'X Wallet',
          imageUrl: 'https://api.web3modal.com/public/getAssetImage/undefined',
        },
      ],
      wcWallets: [],
      isFetchingWallets: false,
      isFetchingWcUri: false,
      isInitialized: true,
      wcUri: undefined,
      connectingWallet: undefined,
      connect: vi.fn(),
      getWcUri: vi.fn(),
      fetchWallets: vi.fn(),
      resetWcUri: vi.fn(),
      resetConnectingWallet: vi.fn(),
    });

    const { container } = render(
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

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('XW')).toBeTruthy();
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
      getWcUri: vi.fn(),
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
      getWcUri: vi.fn(),
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
