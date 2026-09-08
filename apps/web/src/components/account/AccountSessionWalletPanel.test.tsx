import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { AccountSessionWalletPanel } from '@/components/account/AccountSessionWalletPanel';

const ADDRESS = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';

function renderPanel(
  overrides: Partial<ComponentProps<typeof AccountSessionWalletPanel>> = {},
) {
  const onSignOut = vi.fn();
  const onDisconnect = vi.fn();
  const onConnectWallet = vi.fn();
  const onCopyAddress = vi.fn();
  const onExportWallet = vi.fn();
  render(
    <AccountSessionWalletPanel
      sessionOnly={false}
      embedded={false}
      walletAddress={ADDRESS}
      chainLabel="Robinhood Chain"
      mayBroadcastOnChain
      onChainMessage={null}
      onSignOut={onSignOut}
      onDisconnect={onDisconnect}
      onConnectWallet={onConnectWallet}
      onCopyAddress={onCopyAddress}
      onExportWallet={onExportWallet}
      {...overrides}
    />,
  );
  return {
    onSignOut,
    onDisconnect,
    onConnectWallet,
    onCopyAddress,
    onExportWallet,
  };
}

describe('AccountSessionWalletPanel', () => {
  it('authenticated + wallet connected shows both concepts and distinct actions', () => {
    const { onSignOut, onDisconnect } = renderPanel();

    expect(screen.getByRole('heading', { name: /scoop account/i })).toBeTruthy();
    expect(screen.getByText(/^signed in$/i)).toBeTruthy();
    expect(screen.getByText(/profile and session are active/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /connected wallet/i })).toBeTruthy();
    expect(screen.getByText(/external wallet · robinhood chain/i)).toBeTruthy();
    expect(screen.getByText(/ready for on-chain actions/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^sign out of scoop$/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^disconnect wallet$/i }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('disconnect helper says SCOOP account may remain signed in', () => {
    renderPanel();
    expect(
      screen.getByText(/your scoop account may remain signed in/i),
    ).toBeTruthy();
  });

  it('session-only keeps signed-in copy, hides disconnect, offers connect wallet', () => {
    const { onConnectWallet, onDisconnect } = renderPanel({
      sessionOnly: true,
      mayBroadcastOnChain: false,
      onChainMessage: 'Connect an external wallet to continue.',
    });

    expect(screen.getByText(/^signed in$/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /wallet connection/i })).toBeTruthy();
    expect(screen.getByText(/no external wallet connected/i)).toBeTruthy();
    expect(screen.getByText(/connect a wallet to launch or trade on scoop/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^disconnect wallet$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^connect wallet$/i }));
    expect(onConnectWallet).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('email/embedded connected copy requires external wallet for MVP transactions', () => {
    renderPanel({
      embedded: true,
      exportAvailability: 'ready',
      mayBroadcastOnChain: false,
      onChainMessage: 'Connect an external wallet to continue on-chain.',
    });

    expect(screen.getByText(/scoop wallet/i)).toBeTruthy();
    expect(screen.getByText(/embedded wallet · created with email/i)).toBeTruthy();
    expect(
      screen.getByText(/embedded-wallet transactions are not enabled for this mvp/i),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^connect wallet$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^disconnect wallet$/i })).toBeTruthy();
  });

  it('embedded + ready shows Export wallet and Reown handoff copy', () => {
    const { onExportWallet } = renderPanel({
      embedded: true,
      exportAvailability: 'ready',
      mayBroadcastOnChain: false,
      onChainMessage: null,
    });

    expect(
      screen.getByText(/manage and export your embedded wallet securely through reown/i),
    ).toBeTruthy();
    expect(screen.getByText(/scoop never sees your private key/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^export wallet$/i }));
    expect(onExportWallet).toHaveBeenCalledTimes(1);
  });

  it('external wallet hides Export wallet', () => {
    renderPanel({
      embedded: false,
      exportAvailability: 'hidden',
    });
    expect(screen.queryByRole('button', { name: /^export wallet$/i })).toBeNull();
    expect(
      screen.queryByText(/manage and export your embedded wallet/i),
    ).toBeNull();
  });

  it('session-only embedded shows reconnect export state without Export CTA', () => {
    renderPanel({
      sessionOnly: true,
      embedded: true,
      exportAvailability: 'reconnect',
      mayBroadcastOnChain: false,
      onChainMessage: null,
    });
    expect(
      screen.getByText(/reconnect your scoop wallet to export it/i),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^export wallet$/i })).toBeNull();
  });

  it('shows friendly export error without key material', () => {
    renderPanel({
      embedded: true,
      exportAvailability: 'ready',
      exportError: "We couldn't open wallet export right now. Try again in a moment.",
      mayBroadcastOnChain: false,
      onChainMessage: null,
    });
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't open wallet export/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/private key|mnemonic|0x[a-f0-9]{64}/i);
  });

  it('hides disconnect when no wallet is connected', () => {
    renderPanel({ sessionOnly: true });
    expect(screen.queryByRole('button', { name: /^disconnect wallet$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^sign out of scoop$/i })).toBeTruthy();
  });
});
