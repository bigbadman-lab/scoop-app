import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const open = vi.fn();
const useAccount = vi.fn();
const ensureRuntime = vi.fn();
const takePendingIntent = vi.fn(() => null as null | 'connect' | 'account');
const fetchScoopAuthStatus = vi.fn();
const requestSiweSession = vi.fn();
const signMessageAsync = vi.fn();

let shellState = {
  configured: true,
  runtimeReady: false,
  activating: false,
};

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open }),
  useAppKitState: () => ({ open: false, connectingWallet: undefined }),
  useAppKitAccount: () => ({ embeddedWalletInfo: undefined }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
  useSignMessage: () => ({ signMessageAsync }),
}));

vi.mock('@/lib/auth/siwe-session-client', () => ({
  fetchScoopAuthStatus: () => fetchScoopAuthStatus(),
  requestSiweSession: (...args: unknown[]) => requestSiweSession(...args),
}));

vi.mock('@/lib/auth/scoop-auth-events', () => ({
  subscribeScoopAuthChanged: () => () => {},
}));

vi.mock('@/components/auth/WalletShellProvider', () => ({
  useWalletShell: () => ({
    configured: shellState.configured,
    runtimeReady: shellState.runtimeReady,
    activating: shellState.activating,
    cookies: null,
    ensureRuntime,
    takePendingIntent,
  }),
}));

import { WalletSlot } from '@/components/shell/WalletSlot';

describe('WalletSlot (C.1c lazy wallet boundary)', () => {
  beforeEach(() => {
    open.mockReset();
    useAccount.mockReset();
    ensureRuntime.mockReset();
    ensureRuntime.mockResolvedValue(undefined);
    takePendingIntent.mockReset();
    takePendingIntent.mockReturnValue(null);
    fetchScoopAuthStatus.mockReset();
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    requestSiweSession.mockReset();
    signMessageAsync.mockReset();
    shellState = {
      configured: true,
      runtimeReady: false,
      activating: false,
    };
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
  });

  it('configured anonymous shell renders Join SCOOP before runtime is active', () => {
    render(<WalletSlot variant="mobile" />);
    const button = screen.getByRole('button', { name: /join scoop/i });
    expect(button.getAttribute('data-wallet-runtime')).toBe('idle');
    expect(button.textContent).toMatch(/join scoop/i);
    expect(screen.queryByText(/wallet off/i)).toBeNull();
  });

  it('sidebar signed-out control uses SCOOPAV avatar instead of Join text', () => {
    render(<WalletSlot variant="sidebar" />);
    const button = screen.getByRole('button', { name: /join scoop/i });
    expect(button.textContent).not.toMatch(/^join$/i);
    const img = button.querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/SCOOPAV|scoopav/i);
  });

  it('clicking Join SCOOP requests wallet-stack activation once', () => {
    render(<WalletSlot variant="mobile" />);
    fireEvent.click(screen.getByRole('button', { name: /join scoop/i }));
    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(ensureRuntime).toHaveBeenCalledWith('connect');
  });

  it('loading state disables duplicate activation clicks', () => {
    shellState.activating = true;
    render(<WalletSlot variant="mobile" />);
    const button = screen.getByRole('button', { name: /connecting/i });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('data-wallet-runtime')).toBe('loading');
    fireEvent.click(button);
    expect(ensureRuntime).not.toHaveBeenCalled();
  });

  it('once ready with pending connect intent, opens AppKit Connect exactly once', async () => {
    shellState.runtimeReady = true;
    takePendingIntent.mockReturnValue('connect');
    render(<WalletSlot variant="mobile" />);
    await waitFor(
      () => {
        expect(open).toHaveBeenCalledWith({ view: 'Connect' });
      },
      { timeout: 4000 },
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('connected unsigned shows Sign in to SCOOP (not raw address) and starts SIWE on click', async () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    shellState.runtimeReady = true;
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    useAccount.mockReturnValue({
      address,
      isConnected: true,
      status: 'connected',
      connector: { id: 'mock' },
    });
    requestSiweSession.mockResolvedValue({
      ok: false,
      code: 'USER_CANCELLED',
      message: 'cancelled',
    });

    render(<WalletSlot variant="mobile" />);
    const button = await screen.findByRole('button', {
      name: /^sign in to scoop$/i,
    });
    expect(button.textContent).not.toMatch(/0xd8dA/i);
    fireEvent.click(button);
    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalled();
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('authenticated session shows avatar, profile title, address, and links to /account', async () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    shellState.runtimeReady = true;
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: '11111111-1111-1111-1111-111111111111',
      address: address.toLowerCase(),
      chainId: 4663,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        profile: {
          displayName: 'Desk Lead',
          avatarUrl: 'https://signed.example/avatar.png',
        },
      }),
    }) as unknown as typeof fetch;
    useAccount.mockReturnValue({
      address,
      isConnected: true,
      status: 'connected',
      connector: { id: 'mock' },
    });

    render(<WalletSlot variant="mobile" />);
    const link = await screen.findByRole('link', {
      name: /open scoop account for desk lead/i,
    });
    await waitFor(() => {
      expect(screen.getByText('Desk Lead')).toBeTruthy();
      expect(screen.getByText(/0xd8da…6045/i)).toBeTruthy();
    });
    expect(link.getAttribute('href')).toBe('/account');
    const avatar = link.querySelector('img');
    expect(avatar?.getAttribute('src')).toBe('https://signed.example/avatar.png');
    fireEvent.click(link);
    expect(open).not.toHaveBeenCalled();
    expect(requestSiweSession).not.toHaveBeenCalled();
  });

  it('unconfigured state remains deterministic fallback', () => {
    shellState.configured = false;
    render(<WalletSlot variant="mobile" />);
    expect(screen.getByText(/wallet off/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /join scoop/i })).toBeNull();
  });
});
