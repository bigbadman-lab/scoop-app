'use client';

import Link from 'next/link';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { requestScoopConnect } from '@/lib/auth/open-scoop-auth';
import { requestSiweSession } from '@/lib/auth/siwe-session-client';
import { resolveSiweWalletMeta } from '@/lib/auth/wallet-origin';

const ACCOUNT_OPENERS = [
  {
    label: 'Profile',
    detail: 'Display name and avatar for your SCOOP identity.',
  },
  {
    label: 'Tokens launched',
    detail: 'Markets you have deployed, in one place.',
  },
  {
    label: 'Fees',
    detail: 'Deployers earn 4%. Creators earn 70%. Two separate fee streams.',
  },
] as const;

function AccountSignedOutFrame({
  primary,
  error,
  statusNote,
}: {
  primary: React.ReactNode;
  error?: string | null;
  statusNote?: string | null;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-3 md:px-8 md:py-4 lg:px-10">
      <header className="mb-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Account
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight md:text-2xl">
          Your account
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-[var(--muted)]">
          Join once to open your profile. Connect a wallet when you are ready to
          launch or trade.
        </p>
      </header>

      <div>
        {error ? (
          <p className="mb-2 font-mono text-[11px] text-[#b42318]" role="alert">
            {error}
          </p>
        ) : null}
        {statusNote ? (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            {statusNote}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {primary}
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center px-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            Back to markets
          </Link>
        </div>
      </div>

      <ul className="mt-5 max-w-xl divide-y divide-[var(--divider)] border-t border-[var(--divider)]">
        {ACCOUNT_OPENERS.map((item) => (
          <li
            key={item.label}
            className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
              {item.label}
            </p>
            <p className="text-sm text-[var(--muted)] sm:max-w-sm sm:text-right">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** Static frame while wallet runtime boots — same composition, inert CTA. */
export function AccountSignedOutPending({
  activating,
}: {
  activating?: boolean;
} = {}) {
  void activating;
  return (
    <AccountSignedOutFrame
      primary={
        <button
          type="button"
          disabled
          className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] opacity-50"
        >
          Join SCOOP
        </button>
      }
    />
  );
}

/**
 * Signed-out /account destination — Join + SIWE, not launch-assist interrupt chrome.
 */
export function AccountSignedOut({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const { open } = useAppKit();
  const appKitAccount = useAppKitAccount();
  const { address, isConnected, connector, status } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerReady =
    status === 'connected' && Boolean(address) && Boolean(connector);
  const walletConnected = isConnected && Boolean(address);

  async function completeSiwe() {
    if (!signerReady || !address || !connector) {
      setError('Wallet signer is not ready. Reconnect and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const walletMeta = resolveSiweWalletMeta({
        connectorId: connector.id,
        embeddedWalletInfo: appKitAccount.embeddedWalletInfo,
      });
      const result = await requestSiweSession(
        address,
        async ({ message: siweMessage }) =>
          signMessageAsync({ message: siweMessage, connector }),
        ROBINHOOD_CHAIN_ID,
        {
          connectedAddress: address,
          walletType: walletMeta.walletType,
          provider: walletMeta.provider,
        },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onAuthenticated();
    } catch {
      setError('Network error during sign-in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const primary = !walletConnected ? (
    <button
      type="button"
      disabled={busy || status === 'connecting' || status === 'reconnecting'}
      onClick={() => requestScoopConnect(() => open({ view: 'Connect' }))}
      className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {status === 'connecting' || status === 'reconnecting'
        ? 'Connecting…'
        : 'Join SCOOP'}
    </button>
  ) : (
    <button
      type="button"
      disabled={busy || signing || !signerReady}
      onClick={() => void completeSiwe()}
      className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {busy || signing ? 'Confirming…' : 'Finish signing in'}
    </button>
  );

  return (
    <AccountSignedOutFrame
      error={error}
      statusNote={
        walletConnected
          ? 'One quick confirm finishes your SCOOP sign-in — nothing is charged.'
          : null
      }
      primary={primary}
    />
  );
}
