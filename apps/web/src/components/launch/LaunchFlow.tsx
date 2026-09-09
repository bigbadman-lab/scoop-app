'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  catalogue: PublicQuoteCatalogueItem[];
};

type LiveProps = Props;

/**
 * Light launch entry — no AppKit/wagmi static imports.
 * Loads LaunchFlowLive only after WalletRuntimeProviders is ready
 * (same pattern as TokenBuySell / AccountPageClient).
 */
export function LaunchFlow({ catalogue }: Props) {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType<LiveProps> | null>(null);

  useEffect(() => {
    if (!configured) return;
    void ensureRuntime(null);
  }, [configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/launch/LaunchFlowLive').then((mod) => {
      setLive(() => mod.LaunchFlowLive);
    });
  }, [runtimeReady]);

  if (!configured) {
    return (
      <div
        className="mx-auto w-full max-w-[680px] py-10"
        data-testid="launch-flow"
        data-wallet-runtime="off"
      >
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Launch something new
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Wallet auth is not configured in this environment.
        </p>
      </div>
    );
  }

  if (!runtimeReady || !Live) {
    const busy = activating || (runtimeReady && !Live);
    return (
      <div
        className="mx-auto w-full max-w-[680px] py-10 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]"
        data-testid="launch-flow"
        data-wallet-runtime={busy ? 'loading' : 'idle'}
        role="status"
      >
        {busy ? 'Connecting wallet…' : 'Preparing launch…'}
      </div>
    );
  }

  return <Live catalogue={catalogue} />;
}
