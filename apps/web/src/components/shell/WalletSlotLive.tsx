'use client';

import { useAppKit } from '@reown/appkit/react';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import type { WalletOpenIntent } from '@/components/auth/WalletShellProvider';
import { shortenWalletAddress } from '@/lib/auth/reown-public';

/**
 * Heavy wallet chrome — dynamically imported only after WalletRuntimeProviders is ready.
 */
export function WalletSlotLive({
  variant,
  initialIntent,
}: {
  variant: 'sidebar' | 'mobile';
  initialIntent: WalletOpenIntent;
}) {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const intentHandled = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (intentHandled.current || !initialIntent) return;
    intentHandled.current = true;
    open({ view: initialIntent === 'account' ? 'Account' : 'Connect' });
  }, [initialIntent, open]);

  const connecting = status === 'connecting' || status === 'reconnecting';
  const walletReady = mounted && isConnected && Boolean(address);
  const short = walletReady && address ? shortenWalletAddress(address) : null;

  function onClick() {
    if (connecting) return;
    if (walletReady) {
      open({ view: 'Account' });
      return;
    }
    open({ view: 'Connect' });
  }

  if (variant === 'mobile') {
    return (
      <button
        type="button"
        disabled={connecting}
        data-wallet-connected={walletReady ? 'true' : 'false'}
        data-wallet-address={walletReady ? address : undefined}
        data-wallet-runtime="ready"
        onClick={onClick}
        className="inline-flex min-h-10 items-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        title={walletReady ? 'Open wallet account' : 'Connect wallet'}
        aria-label={
          walletReady && address
            ? `Connected ${address}. Open wallet account.`
            : 'Connect wallet'
        }
      >
        {connecting ? '…' : walletReady && short ? short : 'Connect'}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={connecting}
        data-wallet-connected={walletReady ? 'true' : 'false'}
        data-wallet-address={walletReady ? address : undefined}
        data-wallet-runtime="ready"
        onClick={onClick}
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        aria-label={
          walletReady && address
            ? `Connected ${address}. Open wallet account.`
            : 'Connect wallet'
        }
        title={walletReady ? 'Open wallet account' : 'Connect wallet'}
      >
        {connecting ? '…' : walletReady && short ? short.slice(0, 6) : 'Conn'}
      </button>
      {walletReady && short ? (
        <span className="max-w-[4.5rem] truncate font-mono text-[9px] text-[var(--muted)]">
          {short}
        </span>
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
          Connect
        </span>
      )}
    </div>
  );
}
