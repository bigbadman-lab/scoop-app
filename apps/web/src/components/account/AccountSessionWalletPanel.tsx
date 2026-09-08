'use client';

/**
 * Presentational SCOOP-session vs wallet-connection sections for /account.
 * Keeps product semantics explicit: sign-out ≠ disconnect.
 */

import type { EmbeddedExportAvailability } from '@/lib/auth/embedded-wallet-export';

export type AccountSessionWalletPanelProps = {
  sessionOnly: boolean;
  embedded: boolean;
  walletAddress: string;
  chainLabel: string;
  mayBroadcastOnChain: boolean;
  onChainMessage: string | null;
  exportAvailability?: EmbeddedExportAvailability;
  exportError?: string | null;
  exportBusy?: boolean;
  onSignOut: () => void;
  onDisconnect: () => void;
  onConnectWallet: () => void;
  onCopyAddress: () => void;
  onExportWallet?: () => void;
};

export function AccountSessionWalletPanel({
  sessionOnly,
  embedded,
  walletAddress,
  chainLabel,
  mayBroadcastOnChain,
  onChainMessage,
  exportAvailability = 'hidden',
  exportError = null,
  exportBusy = false,
  onSignOut,
  onDisconnect,
  onConnectWallet,
  onCopyAddress,
  onExportWallet,
}: AccountSessionWalletPanelProps) {
  const walletConnected = !sessionOnly;
  const showExport = embedded && exportAvailability !== 'hidden';

  return (
    <>
      <section
        className="mt-12 space-y-4 border-t border-[var(--divider)] pt-8"
        aria-labelledby="scoop-account-heading"
      >
        <h2
          id="scoop-account-heading"
          className="text-lg font-semibold tracking-tight"
        >
          SCOOP account
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
          Signed in
        </p>
        <p className="text-sm text-[var(--muted)]">
          Your SCOOP profile and session are active.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
        >
          Sign out of SCOOP
        </button>
        <p className="text-sm text-[var(--muted)]">
          Signs you out of your SCOOP account on this browser.
        </p>
      </section>

      <section
        className="mt-12 space-y-4 border-t border-[var(--divider)] pt-8"
        aria-labelledby="wallet-connection-heading"
      >
        <h2
          id="wallet-connection-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {walletConnected ? 'Connected wallet' : 'Wallet connection'}
        </h2>

        {sessionOnly ? (
          <div className="space-y-2 text-sm text-[var(--muted)]">
            <p className="text-[var(--fg)]">No external wallet connected.</p>
            <p>Connect a wallet to launch or trade on SCOOP.</p>
            {embedded ? (
              <p>
                An embedded wallet was created with your email account. Embedded
                wallet transactions are not enabled for this MVP — connect an
                external wallet to launch or trade.
              </p>
            ) : null}
            {exportAvailability === 'reconnect' ? (
              <p role="status">
                Reconnect your SCOOP wallet to export it.
              </p>
            ) : null}
          </div>
        ) : embedded ? (
          <div className="space-y-2 text-sm text-[var(--muted)]">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
              SCOOP wallet
            </p>
            <p className="font-mono text-[13px] text-[var(--fg)]">{walletAddress}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Embedded wallet · created with email
            </p>
            {exportAvailability === 'ready' ? (
              <p>
                Manage and export your embedded wallet securely through Reown.
                SCOOP never sees your private key.
              </p>
            ) : exportAvailability === 'reconnect' ? (
              <p role="status">
                Reconnect your SCOOP wallet to export it.
              </p>
            ) : null}
            <p>
              Embedded-wallet transactions are not enabled for this MVP. To
              launch or trade, connect an external wallet.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-mono text-[13px]">{walletAddress}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              External wallet · {chainLabel}
            </p>
            <p className="text-[var(--muted)]">
              {mayBroadcastOnChain
                ? 'Ready for on-chain actions'
                : 'Connected and authenticated'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {walletConnected ? (
            <>
              {showExport && exportAvailability === 'ready' && onExportWallet ? (
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={onExportWallet}
                  className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
                >
                  {exportBusy ? 'Opening…' : 'Export wallet'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onCopyAddress}
                className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
              >
                Copy address
              </button>
              {embedded ? (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
                >
                  Connect wallet
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDisconnect}
                className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
              >
                Disconnect wallet
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onConnectWallet}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
            >
              Connect wallet
            </button>
          )}
        </div>

        {exportError ? (
          <p className="text-sm text-[#b42318]" role="alert">
            {exportError}
          </p>
        ) : null}

        {walletConnected ? (
          <p className="text-sm text-[var(--muted)]">
            Disconnects this wallet from SCOOP. Your SCOOP account may remain
            signed in.
          </p>
        ) : null}

        {!mayBroadcastOnChain && onChainMessage ? (
          <p className="text-sm text-[var(--muted)]" role="status">
            {onChainMessage}
          </p>
        ) : null}
      </section>
    </>
  );
}
