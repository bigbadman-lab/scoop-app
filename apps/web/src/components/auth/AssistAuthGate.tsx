'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';

export type AssistAuthGateProps = {
  resumePath: string;
  onReady: () => void;
  onCancel: () => void;
  /** Fired when a previously-ready gate loses match (e.g. wallet switch). */
  onBlocked?: () => void;
  /** When false, run reconciliation silently (parent shows the flow). */
  visible?: boolean;
};

/**
 * Light gate — no AppKit/wagmi static imports.
 * Reconciles scoop_session vs connected wallet before launch-assist proceeds.
 */
export function AssistAuthGate({
  resumePath,
  onReady,
  onCancel,
  onBlocked,
  visible = true,
}: AssistAuthGateProps) {
  const { configured, runtimeReady, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType<AssistAuthGateProps> | null>(null);
  const [fellThrough, setFellThrough] = useState(false);

  useEffect(() => {
    if (!configured) {
      if (!fellThrough) {
        setFellThrough(true);
        onReady();
      }
      return;
    }
    void ensureRuntime(null);
  }, [configured, ensureRuntime, onReady, fellThrough]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/auth/AssistAuthGateLive').then((mod) => {
      setLive(() => mod.AssistAuthGateLive);
    });
  }, [runtimeReady]);

  if (!configured) {
    if (!visible) return null;
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Preparing…
        </p>
      </div>
    );
  }

  if (!runtimeReady || !Live) {
    if (!visible) return null;
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)] motion-safe:animate-pulse">
          Checking wallet session…
        </p>
      </div>
    );
  }

  return (
    <Live
      resumePath={resumePath}
      onReady={onReady}
      onCancel={onCancel}
      onBlocked={onBlocked}
      visible={visible}
    />
  );
}
