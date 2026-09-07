'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  useWalletShell,
  type WalletOpenIntent,
} from '@/components/auth/WalletShellProvider';

type LiveProps = {
  variant: 'sidebar' | 'mobile';
  initialIntent: WalletOpenIntent;
};

function WalletSlotIdle({
  variant,
  activating,
  onActivate,
}: {
  variant: 'sidebar' | 'mobile';
  activating: boolean;
  onActivate: () => void;
}) {
  if (variant === 'mobile') {
    return (
      <button
        type="button"
        disabled={activating}
        data-wallet-connected="false"
        data-wallet-runtime={activating ? 'loading' : 'idle'}
        onClick={onActivate}
        className="inline-flex min-h-10 items-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        title="Connect wallet"
        aria-label="Connect wallet"
      >
        {activating ? '…' : 'Connect'}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={activating}
        data-wallet-connected="false"
        data-wallet-runtime={activating ? 'loading' : 'idle'}
        onClick={onActivate}
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        aria-label="Connect wallet"
        title="Connect wallet"
      >
        {activating ? '…' : 'Conn'}
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {activating ? '…' : 'Connect'}
      </span>
    </div>
  );
}

function WalletSlotFallback({ variant }: { variant: 'sidebar' | 'mobile' }) {
  if (variant === 'sidebar') {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--divider)] text-[var(--muted-2)]"
        title="Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable wallet connect"
        aria-label="Wallet not configured"
        data-wallet-configured="false"
      >
        <span className="font-mono text-[10px]">Off</span>
      </div>
    );
  }
  return (
    <span
      className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]"
      data-wallet-configured="false"
    >
      Wallet off
    </span>
  );
}

/**
 * Anonymous: light Connect (no AppKit/wagmi imports in this module).
 * One click loads wallet runtime + live chrome, then opens AppKit.
 */
export function WalletSlot({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const {
    configured,
    runtimeReady,
    activating,
    ensureRuntime,
    takePendingIntent,
  } = useWalletShell();
  const [bootIntent, setBootIntent] = useState<WalletOpenIntent>(null);
  const [Live, setLive] = useState<ComponentType<LiveProps> | null>(null);
  const capturedIntent = useRef(false);

  useEffect(() => {
    if (!runtimeReady || capturedIntent.current) return;
    capturedIntent.current = true;
    setBootIntent(takePendingIntent());
    void import('@/components/shell/WalletSlotLive').then((mod) => {
      setLive(() => mod.WalletSlotLive);
    });
  }, [runtimeReady, takePendingIntent]);

  if (!configured) {
    return <WalletSlotFallback variant={variant} />;
  }

  if (!runtimeReady || !Live) {
    return (
      <WalletSlotIdle
        variant={variant}
        activating={activating || (runtimeReady && !Live)}
        onActivate={() => {
          void ensureRuntime('connect');
        }}
      />
    );
  }

  return <Live variant={variant} initialIntent={bootIntent} />;
}
