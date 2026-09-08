'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ROBINHOOD_CHAIN_ID, SCOOP_MARK_SRC } from '@/lib/brand';
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
    <main className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(90% 60% at 12% 0%, color-mix(in srgb, var(--scoop-orange) 16%, transparent), transparent 58%), radial-gradient(70% 50% at 100% 18%, color-mix(in srgb, var(--fg) 6%, transparent), transparent 55%), linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 42%, var(--bg) 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--scoop-orange)] to-transparent opacity-70"
      />

      <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-4 py-14 md:px-8 md:py-20">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Account
          </p>

          <div className="mt-8 flex items-end gap-5">
            <Image
              src={SCOOP_MARK_SRC}
              alt=""
              width={88}
              height={88}
              className="h-[4.5rem] w-[4.5rem] object-contain md:h-[5.5rem] md:w-[5.5rem]"
              priority
            />
            <div className="min-w-0 pb-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--scoop-orange)]">
                SCOOP
              </p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight md:text-5xl">
                Your account
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Join once to open your profile. Connect a wallet when you are ready
            to launch or trade.
          </p>
        </div>

        <div className="mt-10">
          {error ? (
            <p className="mb-4 font-mono text-[11px] text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          {statusNote ? (
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {statusNote}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {primary}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center px-2 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
            >
              Back to markets
            </Link>
          </div>
        </div>

        <ul className="mt-14 max-w-xl divide-y divide-[var(--divider)] border-t border-[var(--divider)]">
          {ACCOUNT_OPENERS.map((item) => (
            <li key={item.label} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
                {item.label}
              </p>
              <p className="text-sm text-[var(--muted)] sm:max-w-sm sm:text-right">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
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
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] opacity-50"
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
      onClick={() => open({ view: 'Connect' })}
      className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
      className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
