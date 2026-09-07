'use client';

import { useAppKit } from '@reown/appkit/react';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { requestSiweSession } from '@/lib/auth/siwe-session-client';
import { sanitizeAssistResumePath } from '@/lib/auth/siwe-client';

type AuthInterruptProps = {
  resumePath: string;
  onAuthenticated: () => void;
  onCancel: () => void;
};

function AuthInterruptShell({
  configured,
  error,
  primary,
  onCancel,
}: {
  configured: boolean;
  error: string | null;
  primary: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-orange)]">
        Sign in to continue
      </p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        Connect a wallet to make a market
      </h1>
      <p className="text-sm text-[var(--muted)]">
        Launch assist uses paid AI. Sign in with an existing wallet to generate
        concepts and artwork. This is a free message signature — not a
        transaction and not gas. Email and social wallets arrive after Robinhood
        Chain embedded support is confirmed.
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
}: AuthInterruptProps) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeResume = sanitizeAssistResumePath(resumePath);

  async function completeSiwe() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await requestSiweSession(
        address,
        signMessageAsync,
        ROBINHOOD_CHAIN_ID,
      );
      if (!ok) {
        setError('Could not verify wallet signature. Try again.');
        return;
      }
      if (safeResume && typeof document !== 'undefined') {
        window.sessionStorage.setItem('scoop:auth:resume', safeResume);
      }
      onAuthenticated();
    } catch {
      setError('Sign-in was cancelled or failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthInterruptShell
      error={error}
      configured
      onCancel={onCancel}
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
            disabled={busy || signing}
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
