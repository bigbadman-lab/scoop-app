'use client';

import { useAppKit } from '@reown/appkit/react';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { requestSiweSession } from '@/lib/auth/siwe-session-client';
import { sanitizeAssistResumePath } from '@/lib/auth/siwe-client';

export type AuthInterruptLiveProps = {
  resumePath: string;
  onAuthenticated: () => void;
  onCancel: () => void;
  /** When true, show different-wallet copy. */
  mismatch?: boolean;
  /** Optional override for the headline. */
  title?: string | null;
  /** Optional override for the intro paragraph. */
  message?: string | null;
};

function AuthInterruptShell({
  configured,
  error,
  primary,
  onCancel,
  mismatch,
  title,
  message,
}: {
  configured: boolean;
  error: string | null;
  primary: React.ReactNode;
  onCancel: () => void;
  mismatch?: boolean;
  title?: string | null;
  message?: string | null;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-orange)]">
        Sign in to continue
      </p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {title?.trim()
          ? title
          : mismatch
            ? "You're connected with a different wallet"
            : 'Connect a wallet to make a market'}
      </h1>
      <p className="text-sm text-[var(--muted)]">
        {message?.trim()
          ? message
          : mismatch
            ? 'Sign in with this wallet to continue.'
            : 'Launch assist uses paid AI. Sign in with an existing wallet to generate concepts and artwork. This is a free message signature — not a transaction and not gas.'}
      </p>

      {!configured ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          Reown is not configured (set NEXT_PUBLIC_REOWN_PROJECT_ID). Browsing still
          works; production AI requires dashboard setup.
        </p>
      ) : null}

      {error ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {primary}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Heavy SIWE UI — only loaded after wallet runtime is ready. */
export function AuthInterruptLive({
  resumePath,
  onAuthenticated,
  onCancel,
  mismatch = false,
  title = null,
  message = null,
}: AuthInterruptLiveProps) {
  const { open } = useAppKit();
  const { address, isConnected, connector, status } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeResume = sanitizeAssistResumePath(resumePath);
  const signerReady = status === 'connected' && Boolean(address) && Boolean(connector);

  async function completeSiwe() {
    if (!signerReady || !address || !connector) {
      setError('Wallet signer is not ready. Reconnect and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestSiweSession(
        address,
        async ({ message: siweMessage }) =>
          signMessageAsync({ message: siweMessage, connector }),
        ROBINHOOD_CHAIN_ID,
        {
          connectedAddress: address,
          onStep: (step, meta) => {
            console.info('[scoop-siwe]', step, {
              connector: connector.id,
              ...meta,
            });
          },
        },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (safeResume && typeof document !== 'undefined') {
        window.sessionStorage.setItem('scoop:auth:resume', safeResume);
      }
      onAuthenticated();
    } catch {
      setError('Network error during sign-in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthInterruptShell
      error={error}
      configured
      onCancel={onCancel}
      mismatch={mismatch}
      title={title}
      message={message}
      primary={
        !isConnected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => open({ view: 'Connect' })}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
          >
            Connect wallet
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || signing || !signerReady}
            onClick={() => void completeSiwe()}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
          >
            {busy || signing ? 'Signing…' : 'Sign in with Ethereum'}
          </button>
        )
      }
    />
  );
}
