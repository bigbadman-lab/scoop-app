'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { isScoopReownEmailProofEnabled } from '@/lib/auth/reown-email-proof';

/**
 * Temporary C.3-proof client shell — loads wallet runtime then Live panel.
 * Not linked from product navigation.
 */
export function ReownEmailProofClient() {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType | null>(null);
  const proofEnabled = isScoopReownEmailProofEnabled();

  useEffect(() => {
    if (!proofEnabled || !configured) return;
    void ensureRuntime(null);
  }, [proofEnabled, configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/dev/ReownEmailProofLive').then((mod) => {
      setLive(() => mod.ReownEmailProofLive);
    });
  }, [runtimeReady]);

  if (!proofEnabled) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Reown email proof disabled</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Set NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF=1 and restart the web app.
        </p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Reown not configured</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          NEXT_PUBLIC_REOWN_PROJECT_ID is required for this proof.
        </p>
      </main>
    );
  }

  if (!runtimeReady || !Live) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-orange)]">
          C.3-proof
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Loading wallet runtime…</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {activating ? 'Activating AppKit / Wagmi (lazy).' : 'Preparing proof panel.'}
        </p>
      </main>
    );
  }

  return <Live />;
}
