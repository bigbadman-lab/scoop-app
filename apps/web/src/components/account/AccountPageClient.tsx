'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { AccountPagePending } from '@/components/account/AccountPagePending';

/**
 * Light account entry — no AppKit/wagmi static imports.
 */
export function AccountPageClient() {
  const { configured, runtimeReady, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!configured) return;
    void ensureRuntime(null);
  }, [configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/account/AccountPageLive').then((mod) => {
      setLive(() => mod.AccountPageLive);
    });
  }, [runtimeReady]);

  if (!configured) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Account
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Wallet auth is not configured in this environment.
        </p>
      </main>
    );
  }

  if (!runtimeReady || !Live) {
    return <AccountPagePending />;
  }

  return <Live />;
}
