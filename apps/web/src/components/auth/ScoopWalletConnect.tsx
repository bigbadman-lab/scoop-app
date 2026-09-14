'use client';

import { useAppKitWallets } from '@reown/appkit/react';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { ScoopWcQr } from '@/components/auth/ScoopWcQr';

type WalletLike = {
  id?: string;
  name?: string;
  imageUrl?: string;
};

type Props = {
  connecting: boolean;
  error: string | null;
  onBack: () => void;
  onConnecting: () => void;
  onConnected: (address: `0x${string}`) => void;
  onCancelled: () => void;
  onFailed: (message: string) => void;
};

/**
 * External wallet chooser for SCOOP custom auth (Reown headless).
 * When headless wallets are not initialized, show a safe unavailable state.
 */
export function ScoopWalletConnect({
  connecting,
  error,
  onBack,
  onConnecting,
  onConnected,
  onCancelled,
  onFailed,
}: Props) {
  const walletsApi = useAppKitWallets();
  const { address, isConnected, status } = useAccount();
  const [showMore, setShowMore] = useState(false);
  const [wcCopied, setWcCopied] = useState(false);

  const wallets = (walletsApi.wallets ?? []) as WalletLike[];
  const wcWallets = (walletsApi.wcWallets ?? []) as WalletLike[];
  const isInitialized = Boolean(walletsApi.isInitialized);
  const isFetchingWallets = Boolean(walletsApi.isFetchingWallets);
  const isFetchingWcUri = Boolean(walletsApi.isFetchingWcUri);
  const wcUri = walletsApi.wcUri;
  const connectingWallet = walletsApi.connectingWallet as WalletLike | undefined;

  const headlessUnavailable =
    isInitialized === false && wallets.length === 0 && !isFetchingWallets;

  const discoveryEmpty =
    isInitialized &&
    !isFetchingWallets &&
    wallets.length === 0 &&
    wcWallets.length === 0;

  const curated = useMemo(() => {
    const list = showMore ? [...wallets, ...wcWallets] : wallets;
    const seen = new Set<string>();
    const out: WalletLike[] = [];
    for (const w of list) {
      const key = String(w.id ?? w.name ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out.slice(0, showMore ? 40 : 8);
  }, [wallets, wcWallets, showMore]);

  useEffect(() => {
    if (!connecting) return;
    if (status === 'connected' && isConnected && address) {
      onConnected(address);
    }
  }, [connecting, status, isConnected, address, onConnected]);

  async function connectWallet(wallet: WalletLike) {
    if (!wallet || typeof walletsApi.connect !== 'function') {
      onFailed('Wallet connect is unavailable in this environment.');
      return;
    }
    onConnecting();
    try {
      await walletsApi.connect(wallet as never);
    } catch (error) {
      const message =
        error instanceof Error && /reject|denied|cancel/i.test(error.message)
          ? 'Connection cancelled.'
          : error instanceof Error
            ? error.message.slice(0, 160)
            : 'Could not connect wallet.';
      if (/cancel/i.test(message)) {
        onCancelled();
        return;
      }
      onFailed(message);
    }
  }

  async function copyWcUri() {
    if (!wcUri) return;
    try {
      await navigator.clipboard.writeText(wcUri);
      setWcCopied(true);
      window.setTimeout(() => setWcCopied(false), 1500);
    } catch {
      setWcCopied(false);
    }
  }

  if (headlessUnavailable) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Wallet list is unavailable. Reown headless wallet discovery did not
          initialize. Try again, or continue with email.
        </p>
        <p className="font-mono text-[11px] text-[var(--muted)]">
          Status: wallets unavailable / not initialized
        </p>
        {error ? (
          <p className="text-sm text-[#b42318]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isFetchingWallets || !isInitialized ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Loading wallets…
        </p>
      ) : null}

      {discoveryEmpty ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            No wallets were discovered. Retry, or continue with email.
          </p>
          <button
            type="button"
            disabled={connecting}
            onClick={() => void walletsApi.fetchWallets?.()}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)]"
          >
            Retry wallet list
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {curated.map((wallet) => {
          const label = wallet.name?.trim() || 'Wallet';
          const key = String(wallet.id ?? label);
          const isActive =
            connecting &&
            connectingWallet &&
            (connectingWallet.id === wallet.id ||
              connectingWallet.name === wallet.name);
          return (
            <li key={key}>
              <button
                type="button"
                disabled={connecting}
                onClick={() => void connectWallet(wallet)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] px-3 text-left transition-colors hover:border-[var(--fg)] disabled:opacity-50"
              >
                <span className="truncate text-sm font-medium text-[var(--fg)]">
                  {label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  {isActive ? 'Connecting…' : 'Connect'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!showMore && (wcWallets.length > 0 || wallets.length > 6) ? (
        <button
          type="button"
          disabled={connecting}
          onClick={() => {
            setShowMore(true);
            void walletsApi.fetchWallets?.();
          }}
          className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          More wallets
        </button>
      ) : null}

      {wcUri ? (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] p-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            WalletConnect
            {isFetchingWcUri ? ' · preparing…' : ''}
          </p>
          <ScoopWcQr uri={wcUri} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyWcUri()}
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg)]"
            >
              {wcCopied ? 'Copied' : 'Copy URI'}
            </button>
            <a
              href={wcUri}
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg)]"
            >
              Open wallet
            </a>
            <button
              type="button"
              onClick={() => walletsApi.resetWcUri?.()}
              className="inline-flex min-h-9 items-center justify-center px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={connecting}
        onClick={() => {
          walletsApi.resetConnectingWallet?.();
          walletsApi.resetWcUri?.();
          onBack();
        }}
        className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
      >
        Back
      </button>
    </div>
  );
}
