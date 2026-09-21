import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  switchActiveNamespace,
  setActiveNamespace,
  setFilterByNamespace,
  getConnectors,
  getConnector,
  connectExternal,
} = vi.hoisted(() => ({
  switchActiveNamespace: vi.fn(async () => undefined),
  setActiveNamespace: vi.fn(),
  setFilterByNamespace: vi.fn(),
  getConnectors: vi.fn(() => [] as unknown[]),
  getConnector: vi.fn(() => undefined),
  connectExternal: vi.fn(async () => undefined),
}));

vi.mock('@reown/appkit-controllers', () => ({
  ChainController: {
    state: { activeChain: 'eip155' as string },
    switchActiveNamespace,
    setActiveNamespace,
  },
  ConnectorController: {
    setFilterByNamespace,
    getConnectors,
    getConnector,
  },
  ConnectorControllerUtil: {
    connectExternal,
  },
}));

import { ensureActiveWalletNamespace } from '@/lib/auth/ensure-wallet-namespace';
import {
  connectScoopWallet,
  resolveNamespaceConnector,
} from '@/lib/auth/connect-scoop-wallet';
import { ChainController } from '@reown/appkit-controllers';

describe('ensureActiveWalletNamespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ChainController.state as { activeChain: string }).activeChain = 'eip155';
  });

  it('switches AppKit activeChain to solana before connect', async () => {
    await ensureActiveWalletNamespace('solana');
    expect(setFilterByNamespace).toHaveBeenCalledWith('solana');
    expect(switchActiveNamespace).toHaveBeenCalledWith('solana');
  });

  it('no-ops switch when already on namespace', async () => {
    (ChainController.state as { activeChain: string }).activeChain = 'solana';
    await ensureActiveWalletNamespace('solana');
    expect(setFilterByNamespace).toHaveBeenCalledWith('solana');
    expect(switchActiveNamespace).not.toHaveBeenCalled();
  });

  it('falls back to setActiveNamespace when switch throws', async () => {
    switchActiveNamespace.mockRejectedValueOnce(new Error('not connected'));
    await ensureActiveWalletNamespace('solana');
    expect(setActiveNamespace).toHaveBeenCalledWith('solana');
  });
});

describe('resolveNamespaceConnector / connectScoopWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ChainController.state as { activeChain: string }).activeChain = 'eip155';
    getConnectors.mockReturnValue([]);
    getConnector.mockReturnValue(undefined);
  });

  it('matches Phantom WalletStandard connector by name', () => {
    getConnectors.mockReturnValue([
      { id: 'Phantom', chain: 'solana', name: 'Phantom', type: 'ANNOUNCED' },
    ]);
    const found = resolveNamespaceConnector(
      { id: 'a1b2c3', name: 'Phantom', isInjected: true, connectors: [] },
      'solana',
    );
    expect(found).toMatchObject({ name: 'Phantom', chain: 'solana' });
  });

  it('connects Solana via ConnectorControllerUtil when connector exists', async () => {
    const connector = {
      id: 'Phantom',
      chain: 'solana',
      name: 'Phantom',
      type: 'ANNOUNCED',
    };
    getConnectors.mockReturnValue([connector]);
    const connect = vi.fn(async () => undefined);

    await connectScoopWallet({
      wallet: { id: 'phantom', name: 'Phantom' },
      namespace: 'solana',
      connect,
    });

    expect(switchActiveNamespace).toHaveBeenCalledWith('solana');
    expect(connectExternal).toHaveBeenCalledWith(connector);
    expect(connect).not.toHaveBeenCalled();
  });

  it('falls back to walletsApi.connect when no Solana connector', async () => {
    const connect = vi.fn(async () => undefined);
    const wallet = { id: 'remote-wc', name: 'Solflare' };

    await connectScoopWallet({
      wallet,
      namespace: 'solana',
      connect,
    });

    expect(connectExternal).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(wallet, 'solana');
  });
});
