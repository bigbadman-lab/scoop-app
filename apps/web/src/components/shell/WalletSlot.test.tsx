import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const open = vi.fn();
const useAccount = vi.fn();
const ensureRuntime = vi.fn();
const takePendingIntent = vi.fn(() => null as null | 'connect' | 'account');

let shellState = {
  configured: true,
  runtimeReady: false,
  activating: false,
};

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
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
    shellState = {
      configured: true,
      runtimeReady: false,
      activating: false,
    };
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
  });

  it('configured anonymous shell renders Connect before runtime is active', () => {
    render(<WalletSlot variant="mobile" />);
    const button = screen.getByRole('button', { name: /connect wallet/i });
    expect(button.getAttribute('data-wallet-runtime')).toBe('idle');
    expect(button.textContent).toMatch(/connect/i);
    expect(screen.queryByText(/wallet off/i)).toBeNull();
  });

  it('clicking Connect requests wallet-stack activation once', () => {
    render(<WalletSlot variant="mobile" />);
    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(ensureRuntime).toHaveBeenCalledWith('connect');
  });

  it('loading state disables duplicate activation clicks', () => {
    shellState.activating = true;
    render(<WalletSlot variant="mobile" />);
    const button = screen.getByRole('button', { name: /connect wallet/i });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('data-wallet-runtime')).toBe('loading');
    fireEvent.click(button);
    expect(ensureRuntime).not.toHaveBeenCalled();
  });

  it('once ready with pending connect intent, opens AppKit Connect exactly once', async () => {
    shellState.runtimeReady = true;
    takePendingIntent.mockReturnValue('connect');
    render(<WalletSlot variant="mobile" />);
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ view: 'Connect' });
    });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('connected state shows shortened address and opens Account (no SIWE)', async () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    shellState.runtimeReady = true;
    useAccount.mockReturnValue({
      address,
      isConnected: true,
      status: 'connected',
    });

    render(<WalletSlot variant="mobile" />);
    const button = await screen.findByRole('button', {
      name: new RegExp(`connected ${address}`, 'i'),
    });
    await waitFor(() => {
      expect(button.textContent).toBe('0xd8dA…6045');
    });
    expect(button.textContent).not.toMatch(/sign in|siwe/i);
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith({ view: 'Account' });
  });

  it('unconfigured state remains deterministic fallback', () => {
    shellState.configured = false;
    render(<WalletSlot variant="mobile" />);
    expect(screen.getByText(/wallet off/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /connect wallet/i })).toBeNull();
  });
});
