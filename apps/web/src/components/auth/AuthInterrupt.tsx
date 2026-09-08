'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';

type AuthInterruptProps = {
  resumePath: string;
  onAuthenticated: () => void;
  onCancel: () => void;
  mismatch?: boolean;
  message?: string | null;
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
        concepts and artwork. Email and social wallets arrive after Robinhood Chain
        embedded support is confirmed.
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

/**
 * Light gate — no AppKit/wagmi static imports. Loads runtime then AuthInterruptLive.
 */
export function AuthInterrupt(props: AuthInterruptProps) {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType<AuthInterruptProps> | null>(null);

  useEffect(() => {
    if (!configured) return;
    void ensureRuntime(null);
  }, [configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/auth/AuthInterruptLive').then((mod) => {
      setLive(() => mod.AuthInterruptLive);
    });
  }, [runtimeReady]);

  if (!configured) {
    return (
      <AuthInterruptShell
        configured={false}
        error={null}
        onCancel={props.onCancel}
        primary={null}
      />
    );
  }

  if (!runtimeReady || !Live) {
    return (
      <AuthInterruptShell
        configured
        error={null}
        onCancel={props.onCancel}
        primary={
          <button
            type="button"
            disabled={activating || !runtimeReady}
            onClick={() => void ensureRuntime(null)}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
          >
            {activating || !Live ? 'Loading wallet…' : 'Continue'}
          </button>
        }
      />
    );
  }

  return <Live {...props} />;
}
