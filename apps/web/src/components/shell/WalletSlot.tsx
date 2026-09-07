'use client';

import { useAppKit } from '@reown/appkit/react';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { isReownConfigured } from '@/lib/auth/chain';
import { requestSiweSession } from '@/components/auth/AuthProviders';

type PublicSession =
  | { status: 'loading' | 'anonymous' }
  | { status: 'authenticated'; address: string };

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletSlotConfigured({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending } = useSignMessage();
  const [session, setSession] = useState<PublicSession>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = (await res.json()) as { authenticated?: boolean; address?: string };
      if (data.authenticated && data.address) {
        setSession({ status: 'authenticated', address: data.address });
      } else {
        setSession({ status: 'anonymous' });
      }
    } catch {
      setSession({ status: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signIn() {
    if (!address || chainId == null) {
      open({ view: 'Connect' });
      return;
    }
    const ok = await requestSiweSession(address, chainId, signMessageAsync);
    if (ok) await refresh();
  }

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    disconnect();
    setSession({ status: 'anonymous' });
  }

  const authenticated = session.status === 'authenticated';
  const label = authenticated
    ? shorten(session.address)
    : isConnected && address
      ? 'Sign in'
      : 'Connect';

  if (variant === 'mobile') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (authenticated) void signOut();
          else if (isConnected) void signIn();
          else open({ view: 'Connect' });
        }}
        className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg)]"
        title={authenticated ? 'Sign out ends launch-assist access' : 'Connect wallet'}
      >
        {authenticated ? `${label} · Out` : label}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (authenticated) void signOut();
          else if (isConnected) void signIn();
          else open({ view: 'Connect' });
        }}
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
        aria-label={authenticated ? `Signed in as ${session.address}. Sign out.` : 'Connect wallet'}
        title={
          authenticated
            ? 'Sign out — ends launch-assist access (wallet may stay connected)'
            : 'Connect wallet'
        }
      >
        {authenticated ? label.slice(0, 6) : isConnected ? 'SIWE' : 'W'}
      </button>
      {authenticated ? (
        <span className="max-w-[4.5rem] truncate font-mono text-[9px] text-[var(--muted)]">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function WalletSlotFallback({ variant }: { variant: 'sidebar' | 'mobile' }) {
  if (variant === 'sidebar') {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--divider)] text-[var(--muted-2)]"
        title="Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable wallet auth"
        aria-label="Wallet not configured"
      >
        <span className="font-mono text-[10px]">Off</span>
      </div>
    );
  }
  return (
    <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
      Wallet off
    </span>
  );
}

/**
 * Account slot — Connect / SIWE sign-in / Sign out.
 * "Sign out" clears SCOOP session (paid AI). Disconnect is separate via AppKit account view.
 */
export function WalletSlot({ variant }: { variant: 'sidebar' | 'mobile' }) {
  if (!isReownConfigured()) {
    return <WalletSlotFallback variant={variant} />;
  }
  return <WalletSlotConfigured variant={variant} />;
}
