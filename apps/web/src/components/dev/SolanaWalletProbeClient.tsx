'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { isScoopSolanaWalletProbeEnabled } from '@/lib/solana/wallet-probe';

/**
 * Gate B Solana wallet probe shell — loads wallet runtime then Live panel.
 * Not linked from product navigation.
 */
export function SolanaWalletProbeClient() {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType | null>(null);
  const probeEnabled = isScoopSolanaWalletProbeEnabled();

  useEffect(() => {
    if (!probeEnabled || !configured) return;
    void ensureRuntime(null);
  }, [probeEnabled, configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/dev/SolanaWalletProbeLive').then((mod) => {
      setLive(() => mod.SolanaWalletProbeLive);
    });
  }, [runtimeReady]);

  if (!probeEnabled) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Solana wallet probe disabled</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Set NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE=1 and restart the web app.
        </p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Reown not configured</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          NEXT_PUBLIC_REOWN_PROJECT_ID is required for this probe.
        </p>
      </main>
    );
  }

  if (!runtimeReady || !Live) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
          Gate B probe
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Loading wallet runtime…</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {activating
            ? 'Activating AppKit / Wagmi / Solana (lazy).'
            : 'Preparing Solana probe panel.'}
        </p>
      </main>
    );
  }

  return <Live />;
}
