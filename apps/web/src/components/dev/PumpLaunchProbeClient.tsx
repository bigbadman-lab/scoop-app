'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { isScoopPumpProbeEnabled } from '@/lib/launch/adapters/pump/probe-flag';

export function PumpLaunchProbeClient() {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType | null>(null);
  const enabled = isScoopPumpProbeEnabled();

  useEffect(() => {
    if (!enabled || !configured) return;
    void ensureRuntime(null);
  }, [enabled, configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/dev/PumpLaunchProbeLive').then((mod) => {
      setLive(() => mod.PumpLaunchProbeLive);
    });
  }, [runtimeReady]);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Pump probe disabled</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Set NEXT_PUBLIC_SCOOP_PUMP_PROBE=1 and restart the web app.
        </p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Reown not configured</h1>
      </main>
    );
  }

  if (!runtimeReady || !Live) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
          Gate C probe
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Loading wallet runtime…</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {activating ? 'Activating AppKit…' : 'Preparing Pump preview.'}
        </p>
      </main>
    );
  }

  return <Live />;
}
