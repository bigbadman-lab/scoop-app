import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ScoopAuthSheet } from '@/components/auth/ScoopAuthSheet';
import {
  closeScoopAuthSheet,
  getScoopConnectNamespace,
  openScoopAuthSheet,
} from '@/lib/auth/open-scoop-auth';

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

vi.mock('@/components/auth/ScoopWalletConnect', () => ({
  ScoopWalletConnect: ({ namespace }: { namespace: string }) => (
    <div data-testid="scoop-wallet-connect" data-namespace={namespace}>
      wallets
    </div>
  ),
}));

vi.mock('@/components/auth/ScoopEmailAuth', () => ({
  ScoopEmailAuth: () => <div data-testid="scoop-email-auth">email</div>,
}));

describe('ScoopAuthSheet Join → Solana', () => {
  beforeEach(() => {
    closeScoopAuthSheet();
    process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = '1';
    openScoopAuthSheet();
  });

  it('offers Connect Solana on Join entry and switches namespace', async () => {
    render(
      <ScoopAuthSheet open onClose={() => undefined} namespace="eip155" />,
    );

    expect(screen.getByText(/Continue with email/i)).toBeTruthy();
    expect(screen.getByText(/Connect Ethereum wallet/i)).toBeTruthy();

    await act(async () => {
      screen.getByTestId('scoop-join-connect-solana').click();
    });

    expect(getScoopConnectNamespace()).toBe('solana');
    expect(screen.getByTestId('scoop-wallet-connect').dataset.namespace).toBe(
      'solana',
    );
    expect(screen.getByText(/Connect Solana Wallet/i)).toBeTruthy();
  });

  it('opens directly to Solana wallet list when namespace is solana', () => {
    render(
      <ScoopAuthSheet open onClose={() => undefined} namespace="solana" />,
    );
    expect(screen.queryByTestId('scoop-join-connect-solana')).toBeNull();
    expect(screen.getByTestId('scoop-wallet-connect').dataset.namespace).toBe(
      'solana',
    );
  });
});
