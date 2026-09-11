'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { AuthInterrupt } from '@/components/auth/AuthInterrupt';
import { AccountSessionWalletPanel } from '@/components/account/AccountSessionWalletPanel';
import { AccountSignedOut } from '@/components/account/AccountSignedOut';
import { AccountPagePending } from '@/components/account/AccountPagePending';
import {
  EMBEDDED_WALLET_EXPORT_ERROR,
  openEmbeddedWalletExportViaAppKit,
  resolveEmbeddedExportAvailability,
} from '@/lib/auth/embedded-wallet-export';
import { isEmbeddedWalletAccount } from '@/lib/auth/wallet-origin';
import { resolveScoopAuthState } from '@/lib/auth/reconciliation';
import { signOutScoopSession, publishScoopProfileUpdate } from '@/lib/auth/scoop-auth-events';
import { fetchScoopAuthStatus } from '@/lib/auth/siwe-session-client';
import type { PublicAccountResponse } from '@/lib/account/load-account';
import { shouldBlankAccountWhileRefreshing } from '@/lib/account/account-page-refresh';
import { TokenImage } from '@/components/ui/TokenImage';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import { CreatorClaimsLane } from '@/components/account/CreatorClaimsLane';
import { DeployerFeesLane } from '@/components/account/DeployerFeesLane';
import { HolderRewardsLane } from '@/components/account/HolderRewardsLane';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'wallet_mismatch' }
  | { kind: 'ready'; account: PublicAccountResponse; sessionOnly: boolean }
  | { kind: 'error'; message: string };

function formatJoined(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Account
      </p>
      {children}
    </main>
  );
}

function FeesSection({
  deployerAssets,
  creatorAssets,
  sessionOnly,
}: {
  deployerAssets: PublicAccountResponse['fees']['deployer']['assets'];
  creatorAssets: PublicAccountResponse['fees']['creator']['assets'];
  sessionOnly: boolean;
}) {
  return (
    <section className="mt-10 space-y-5 border-t border-[var(--divider)] pt-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Fees</h2>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Protocol trading-fee split · two separate streams
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <DeployerFeesLane assets={deployerAssets} />
        <CreatorClaimsLane feeAssets={creatorAssets} sessionOnly={sessionOnly} />
      </div>
    </section>
  );
}

function AccountReady({
  account,
  sessionOnly,
  onRefresh,
  onWalletDisconnected,
  onSignOutRequest,
}: {
  account: PublicAccountResponse;
  sessionOnly: boolean;
  onRefresh: () => void;
  /** Optimistic session-only flip before wagmi settles — avoids account→Join flash. */
  onWalletDisconnected: () => void;
  /** Full sign-out may replace the page; allow a deliberate loading transition. */
  onSignOutRequest: () => void;
}) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { connector } = useAccount();
  const appKitAccount = useAppKitAccount();
  const [displayName, setDisplayName] = useState(
    account.user.profile.displayName ?? '',
  );
  const [avatarUrl, setAvatarUrl] = useState(account.user.profile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasEmbeddedWalletInfo = Boolean(appKitAccount.embeddedWalletInfo);
  const embedded = isEmbeddedWalletAccount({
    storedWalletType: account.wallet.walletType,
    connectorId: connector?.id,
    hasEmbeddedWalletInfo,
  });
  const exportAvailability = resolveEmbeddedExportAvailability({
    walletType: account.wallet.walletType,
    sessionOnly,
    connectorId: connector?.id,
    hasEmbeddedWalletInfo,
  });

  useEffect(() => {
    setExportError(null);
    setExportBusy(false);
  }, [account.user.id, account.wallet.walletType]);

  async function exportWallet() {
    if (exportAvailability !== 'ready') return;
    setExportBusy(true);
    setExportError(null);
    try {
      const result = await openEmbeddedWalletExportViaAppKit(async () => {
        await open({ view: 'Account' });
      });
      if (result === 'error') {
        setExportError(EMBEDDED_WALLET_EXPORT_ERROR);
      }
    } finally {
      setExportBusy(false);
    }
  }

  async function saveDisplayName() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        profile?: { displayName: string | null; avatarUrl: string };
      };
      if (!res.ok || !data.ok || !data.profile) {
        setError(data.error ?? 'Could not save display name');
        return;
      }
      setDisplayName(data.profile.displayName ?? '');
      setAvatarUrl(data.profile.avatarUrl);
      setMessage('Display name saved');
      publishScoopProfileUpdate({
        userId: account.user.id,
        displayName: data.profile.displayName,
        avatarUrl: data.profile.avatarUrl,
      });
      onRefresh();
    } catch {
      setError('Could not save display name');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.set('avatar', file);
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        profile?: { avatarUrl: string; displayName: string | null };
      };
      if (!res.ok || !data.ok || !data.profile) {
        setError(data.error ?? 'Could not upload avatar');
        return;
      }
      setAvatarUrl(data.profile.avatarUrl);
      setMessage('Avatar updated');
      publishScoopProfileUpdate({
        userId: account.user.id,
        displayName: data.profile.displayName,
        avatarUrl: data.profile.avatarUrl,
      });
      onRefresh();
    } catch {
      setError('Could not upload avatar');
    } finally {
      setUploading(false);
    }
  }

  async function signOutScoop() {
    setError(null);
    try {
      const ok = await signOutScoopSession();
      if (!ok) {
        setError('Could not sign out');
        return;
      }
      onSignOutRequest();
    } catch {
      setError('Could not sign out');
    }
  }

  async function disconnectWalletOnly() {
    setError(null);
    try {
      // Keep /account chrome mounted; only the wallet panel should change.
      onWalletDisconnected();
      await disconnect();
      onRefresh();
    } catch {
      setError('Could not disconnect wallet');
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account.wallet.address);
      setMessage('Address copied');
    } catch {
      setError('Could not copy address');
    }
  }

  return (
    <AccountShell>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt=""
              width={88}
              height={88}
              className="h-[88px] w-[88px] rounded-full object-cover"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : 'Change avatar'}
            </button>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {account.user.profile.displayName?.trim() || 'Your SCOOP profile'}
            </h1>
            <p className="font-mono text-[12px] text-[var(--muted)]">
              Joined {formatJoined(account.user.joinedAt)}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={48}
                placeholder="Display name"
                className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 text-sm"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDisplayName()}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {message ? (
          <p className="mt-4 font-mono text-[11px] text-[var(--muted)]" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 font-mono text-[11px] text-[#b42318]" role="alert">
            {error}
          </p>
        ) : null}

        <AccountSessionWalletPanel
          sessionOnly={sessionOnly}
          embedded={embedded}
          walletAddress={account.wallet.address}
          chainLabel={account.wallet.chainLabel}
          mayBroadcastOnChain={account.auth.onChain.mayBroadcastOnChain}
          onChainMessage={account.auth.onChain.message}
          exportAvailability={exportAvailability}
          exportError={exportError}
          exportBusy={exportBusy}
          onSignOut={() => void signOutScoop()}
          onDisconnect={() => void disconnectWalletOnly()}
          onConnectWallet={() => open({ view: 'Connect' })}
          onCopyAddress={() => void copyAddress()}
          onExportWallet={() => void exportWallet()}
        />

        <section className="mt-12 space-y-4 border-t border-[var(--divider)] pt-8">
          <h2 className="text-lg font-semibold tracking-tight">Tokens launched</h2>
          {account.tokensLaunched.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No tokens launched yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--divider)]">
              {account.tokensLaunched.map((token) => (
                <li key={token.tokenAddress} className="flex items-center gap-4 py-4">
                  <TokenImage
                    src={pickTokenImageSrc(token.displayImageUrl, token.imageUri)}
                    alt={token.name}
                    size={40}
                    className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tracking-tight">{token.name}</p>
                    <p className="font-mono text-[12px] text-[var(--muted)]">
                      ${token.symbol}
                      <span className="text-[var(--muted-2)]"> · </span>
                      {token.launchComplete ? 'Bonded' : 'Launching'}
                    </p>
                  </div>
                  <Link
                    href={token.href}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <FeesSection
          deployerAssets={account.fees.deployer.assets}
          creatorAssets={account.fees.creator.assets}
          sessionOnly={sessionOnly}
        />

        <HolderRewardsLane
          sessionOnly={sessionOnly}
          mayBroadcastOnChain={account.auth.onChain.mayBroadcastOnChain}
        />
    </AccountShell>
  );
}

/** Heavy account surface — AppKit/wagmi. Loaded only after wallet runtime is ready. */
export function AccountPageLive() {
  const { address, isConnected, status } = useAccount();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const refreshGen = useRef(0);

  const refresh = useCallback(async (opts?: { forceBlank?: boolean }) => {
    const gen = ++refreshGen.current;
    setState((prev) =>
      shouldBlankAccountWhileRefreshing(prev.kind, opts)
        ? { kind: 'loading' }
        : prev,
    );

    const session = await fetchScoopAuthStatus();
    if (gen !== refreshGen.current) return;

    const connected =
      status === 'connected' && isConnected && typeof address === 'string';
    const reconciliation = resolveScoopAuthState({
      sessionAuthenticated: session.authenticated,
      sessionAddress: session.authenticated ? session.address : null,
      connected,
      connectedAddress: connected ? address : null,
    });

    if (reconciliation === 'signed_out' || reconciliation === 'connected_unsigned') {
      setState({ kind: 'signed_out' });
      return;
    }
    if (reconciliation === 'wallet_mismatch') {
      setState({ kind: 'wallet_mismatch' });
      return;
    }

    const res = await fetch('/api/account', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (gen !== refreshGen.current) return;

    if (res.status === 401) {
      setState({ kind: 'signed_out' });
      return;
    }
    if (!res.ok) {
      setState({ kind: 'error', message: 'Could not load account' });
      return;
    }
    const account = (await res.json()) as PublicAccountResponse;
    if (gen !== refreshGen.current) return;
    setState({
      kind: 'ready',
      account,
      sessionOnly: reconciliation === 'session_only',
    });
  }, [address, isConnected, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Immediate panel update when wagmi drops the wallet (incl. AppKit disconnect).
  useEffect(() => {
    const connected =
      status === 'connected' && isConnected && typeof address === 'string';
    const connectedAddress = connected ? address : null;
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      if (!connected && !prev.sessionOnly) {
        return { ...prev, sessionOnly: true };
      }
      if (
        connectedAddress &&
        prev.sessionOnly &&
        connectedAddress.toLowerCase() ===
          prev.account.wallet.address.toLowerCase()
      ) {
        return { ...prev, sessionOnly: false };
      }
      return prev;
    });
  }, [address, isConnected, status]);

  if (state.kind === 'loading') {
    return <AccountPagePending />;
  }

  if (state.kind === 'signed_out') {
    return <AccountSignedOut onAuthenticated={() => void refresh()} />;
  }

  if (state.kind === 'wallet_mismatch') {
    return (
      <AuthInterrupt
        resumePath="/account"
        mismatch
        onAuthenticated={() => void refresh()}
        onCancel={() => {
          window.location.href = '/';
        }}
        title="Different wallet connected"
        message="Sign in with this wallet to switch your active SCOOP profile."
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <AccountShell>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-6 font-mono text-[12px] uppercase tracking-[0.14em]"
        >
          Try again
        </button>
      </AccountShell>
    );
  }

  return (
    <AccountReady
      account={state.account}
      sessionOnly={state.sessionOnly}
      onRefresh={() => void refresh()}
      onWalletDisconnected={() => {
        setState((prev) =>
          prev.kind === 'ready' ? { ...prev, sessionOnly: true } : prev,
        );
      }}
      onSignOutRequest={() => void refresh({ forceBlank: true })}
    />
  );
}
