'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  useWalletShell,
  type WalletOpenIntent,
} from '@/components/auth/WalletShellProvider';
import { SCOOP_AVATAR_SRC } from '@/lib/brand';

type LiveProps = {
  variant: 'sidebar' | 'mobile';
  initialIntent: WalletOpenIntent;
};

function JoinSidebarAvatar({ busy }: { busy?: boolean }) {
  return (
    <span className="relative flex h-12 w-12 overflow-hidden rounded-[var(--radius-md)]">
      <Image
        src={SCOOP_AVATAR_SRC}
        alt=""
        width={48}
        height={48}
        className={`h-full w-full object-cover transition-opacity ${busy ? 'opacity-50' : ''}`}
        priority
      />
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/35 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg)]">
          …
        </span>
      ) : null}
    </span>
  );
}

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
        title={activating ? 'Connecting…' : 'Sign in'}
        aria-label={activating ? 'Connecting…' : 'Sign in'}
      >
        {activating ? 'Connecting…' : 'Sign in'}
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
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--divider)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        aria-label={activating ? 'Connecting…' : 'Sign in'}
        title={activating ? 'Connecting…' : 'Sign in'}
      >
        <JoinSidebarAvatar busy={activating} />
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {activating ? '…' : 'Sign in'}
      </span>
    </div>
  );
}

function WalletSlotFallback({ variant }: { variant: 'sidebar' | 'mobile' }) {
  if (variant === 'sidebar') {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--divider)] text-[var(--muted-2)]"
        title="Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable Join SCOOP"
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
 * Anonymous: light Join SCOOP (no AppKit/wagmi imports in this module).
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
  const pendingIntentRef = useRef<WalletOpenIntent>(null);
  const capturedIntent = useRef(false);

  useEffect(() => {
    if (!runtimeReady || capturedIntent.current) return;
    capturedIntent.current = true;
    // Capture synchronously so Live never mounts with a lost connect intent.
    const intent = takePendingIntent();
    pendingIntentRef.current = intent;
    setBootIntent(intent);
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

  return (
    <Live
      variant={variant}
      initialIntent={bootIntent ?? pendingIntentRef.current}
    />
  );
}
