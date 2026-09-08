'use client';

import { useAppKit, useAppKitAccount, useAppKitState } from '@reown/appkit/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ProfileAvatar } from '@/components/account/ProfileAvatar';
import type { WalletOpenIntent } from '@/components/auth/WalletShellProvider';
import { resolveAvatarUrl } from '@/lib/account/avatar';
import { ROBINHOOD_CHAIN_ID, SCOOP_AVATAR_SRC } from '@/lib/brand';
import {
  joinShellLabel,
  shouldAutoStartSiwe,
  shouldResetJoinAfterModalClose,
  type ScoopJoinPhase,
} from '@/lib/auth/join-flow';
import { resolveScoopAuthState } from '@/lib/auth/reconciliation';
import { subscribeScoopAuthChanged } from '@/lib/auth/scoop-auth-events';
import {
  fetchScoopAuthStatus,
  requestSiweSession,
} from '@/lib/auth/siwe-session-client';
import { resolveSiweWalletMeta } from '@/lib/auth/wallet-origin';

function ChevronAffordance({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ProfileChrome = {
  displayName: string | null;
  avatarUrl: string | null;
};

function AccountChromeMobile({
  title,
  subtitle,
  avatarUrl,
  displayName,
  walletReady,
  address,
}: {
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  walletReady: boolean;
  address?: string;
}) {
  return (
    <Link
      href="/account"
      data-wallet-connected={walletReady ? 'true' : 'false'}
      data-wallet-address={walletReady ? address : undefined}
      data-wallet-runtime="ready"
      data-scoop-authed="true"
      className="inline-flex min-h-10 max-w-[14rem] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] py-1.5 pl-1.5 pr-2.5 text-left transition-colors hover:border-[var(--fg)]"
      title="Open SCOOP account"
      aria-label={
        displayName
          ? `Open SCOOP account for ${displayName}`
          : 'Open SCOOP account'
      }
    >
      <ProfileAvatar
        src={avatarUrl}
        label={displayName || title}
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight text-[var(--fg)]">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ChevronAffordance className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
    </Link>
  );
}

function AccountChromeSidebar({
  avatarUrl,
  displayName,
  sessionShort,
  walletReady,
  address,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  sessionShort: string | null;
  walletReady: boolean;
  address?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Link
        href="/account"
        data-wallet-connected={walletReady ? 'true' : 'false'}
        data-wallet-address={walletReady ? address : undefined}
        data-wallet-runtime="ready"
        data-scoop-authed="true"
        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--divider)] bg-transparent transition-colors hover:border-[var(--fg)]"
        aria-label={
          displayName
            ? `Open SCOOP account for ${displayName}`
            : 'Open SCOOP account'
        }
        title="Open SCOOP account"
      >
        <ProfileAvatar
          src={avatarUrl}
          label={displayName || sessionShort || 'SC'}
          size={48}
          roundedClassName="rounded-[var(--radius-md)]"
        />
        <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] ring-1 ring-[var(--divider)]">
          <ChevronAffordance className="h-2.5 w-2.5" />
        </span>
      </Link>
      <span className="max-w-[4.5rem] truncate font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {displayName || sessionShort || 'Account'}
      </span>
    </div>
  );
}

function shortenSession(address: string | null): string | null {
  if (!address || address.length < 10) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Heavy wallet chrome — dynamically imported only after WalletRuntimeProviders is ready.
 * Join SCOOP: connect → auto-SIWE once (intent-gated). Authenticated → /account.
 */
export function WalletSlotLive({
  variant,
  initialIntent,
}: {
  variant: 'sidebar' | 'mobile';
  initialIntent: WalletOpenIntent;
}) {
  const { open } = useAppKit();
  const { open: modalOpen, connectingWallet } = useAppKitState();
  const appKitAccount = useAppKitAccount();
  const { address, isConnected, status, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [mounted, setMounted] = useState(false);
  const [scoopAuthed, setScoopAuthed] = useState(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileChrome>({
    displayName: null,
    avatarUrl: null,
  });
  const [joinPhase, setJoinPhase] = useState<ScoopJoinPhase>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);

  const intentHandled = useRef(false);
  const scoopAuthedRef = useRef(false);
  const refreshGen = useRef(0);
  /** Bumped on signout so in-flight session refreshes cannot restore stale chrome. */
  const authEpochRef = useRef(0);
  /**
   * After SCOOP sign-out, ignore authenticated session reads until an explicit
   * sign-in (cookie may still be readable for a moment; wallet disconnect may
   * also trigger refreshChrome while the cookie lags).
   */
  const signedOutGuardRef = useRef(false);
  const joinIntentRef = useRef(false);
  const siweInFlightRef = useRef(false);
  /** Address we already auto-attempted SIWE for under the current Join intent. */
  const autoSiweAddressRef = useRef<string | null>(null);
  /** Canonical userId for the profile currently shown in chrome. */
  const profileUserIdRef = useRef<string | null>(null);
  /** Tracks AppKit modal open→close for Join cancel reset. */
  const modalWasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scoopAuthedRef.current = scoopAuthed;
    if (scoopAuthed) {
      setJoinPhase('authenticated');
      joinIntentRef.current = false;
      setJoinError(null);
    }
  }, [scoopAuthed]);

  const clearProfileChrome = useCallback(() => {
    profileUserIdRef.current = null;
    setScoopAuthed(false);
    setSessionAddress(null);
    setProfile({ displayName: null, avatarUrl: null });
  }, []);

  const clearAuthenticatedChrome = useCallback(() => {
    clearProfileChrome();
    setJoinPhase('idle');
    joinIntentRef.current = false;
    autoSiweAddressRef.current = null;
    setJoinError(null);
  }, [clearProfileChrome]);

  const refreshChrome = useCallback(async (opts?: { soft?: boolean }) => {
    const gen = ++refreshGen.current;
    const epoch = authEpochRef.current;
    const session = await fetchScoopAuthStatus();
    if (gen !== refreshGen.current) return;
    // Sign-out invalidated this refresh — never re-apply prior identity.
    if (epoch !== authEpochRef.current) return;

    if (!session.authenticated) {
      // Do not reset Join intent here — an in-progress Join may be mid-connect/SIWE.
      clearProfileChrome();
      return;
    }

    // Post-signout cookie lag / disconnect refresh must not resurrect profile.
    if (signedOutGuardRef.current) {
      clearAuthenticatedChrome();
      return;
    }

    const switchedUser =
      profileUserIdRef.current != null &&
      profileUserIdRef.current !== session.userId;
    profileUserIdRef.current = session.userId;

    setScoopAuthed(true);
    setSessionAddress(session.address);
    // Soft refresh keeps current chrome while /me loads (no flash to fallback).
    // Hard refresh / user switch may show deterministic fallback until /me returns.
    if (!opts?.soft || switchedUser) {
      setProfile({
        displayName: null,
        avatarUrl: resolveAvatarUrl({ userId: session.userId }),
      });
    }

    try {
      const res = await fetch('/api/account/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok || gen !== refreshGen.current) return;
      if (epoch !== authEpochRef.current) return;
      if (signedOutGuardRef.current) return;
      const data = (await res.json()) as {
        userId?: string;
        profile?: {
          displayName?: string | null;
          avatarUrl?: string | null;
        };
      };
      if (gen !== refreshGen.current) return;
      if (epoch !== authEpochRef.current) return;
      if (signedOutGuardRef.current) return;
      // Never apply another user's profile into this shell.
      if (data.userId && data.userId !== session.userId) return;
      const displayName = data.profile?.displayName?.trim() || null;
      const avatarUrl =
        data.profile?.avatarUrl?.trim() ||
        resolveAvatarUrl({
          userId: session.userId,
          displayName,
        });
      setProfile({ displayName, avatarUrl });
    } catch {
      // Keep session fallback avatar.
    }
  }, [clearAuthenticatedChrome, clearProfileChrome]);

  const runSiwe = useCallback(
    async (walletAddress: string) => {
      if (siweInFlightRef.current) return;
      if (!connector) {
        setJoinPhase('failed');
        setJoinError('Wallet signer is not ready. Try again.');
        return;
      }

      siweInFlightRef.current = true;
      setJoinPhase('siwe_in_progress');
      setJoinError(null);

      try {
        const walletMeta = resolveSiweWalletMeta({
          connectorId: connector.id,
          embeddedWalletInfo: appKitAccount.embeddedWalletInfo,
        });
        const result = await requestSiweSession(
          walletAddress,
          async ({ message }) =>
            signMessageAsync({ message, connector }),
          ROBINHOOD_CHAIN_ID,
          {
            connectedAddress: walletAddress,
            walletType: walletMeta.walletType,
            provider: walletMeta.provider,
          },
        );

        if (result.ok) {
          signedOutGuardRef.current = false;
          joinIntentRef.current = false;
          autoSiweAddressRef.current = null;
          setJoinPhase('authenticated');
          await refreshChrome();
          return;
        }

        // Stop auto-retry; recovery CTA only.
        joinIntentRef.current = false;

        if (result.code === 'USER_CANCELLED') {
          setJoinPhase('needs_finish');
          setJoinError(null);
          return;
        }

        setJoinPhase('failed');
        setJoinError('Could not finish signing in.');
      } catch {
        joinIntentRef.current = false;
        setJoinPhase('failed');
        setJoinError('Could not finish signing in.');
      } finally {
        siweInFlightRef.current = false;
      }
    },
    [appKitAccount.embeddedWalletInfo, connector, refreshChrome, signMessageAsync],
  );

  const beginJoinIntent = useCallback(
    (opts?: { openConnectIfNeeded?: boolean }) => {
      joinIntentRef.current = true;
      autoSiweAddressRef.current = null;
      setJoinError(null);

      const walletReadyNow =
        status === 'connected' &&
        isConnected &&
        Boolean(address) &&
        Boolean(connector);

      if (walletReadyNow && address) {
        autoSiweAddressRef.current = address;
        setJoinPhase('wallet_connected_pending_siwe');
        void runSiwe(address);
        return;
      }

      setJoinPhase('opening_wallet');
      if (opts?.openConnectIfNeeded !== false) {
        open({ view: 'Connect' });
      }
    },
    [address, connector, isConnected, open, runSiwe, status],
  );

  const runSiweRef = useRef(runSiwe);
  runSiweRef.current = runSiwe;

  useEffect(() => {
    if (intentHandled.current || !initialIntent) return;
    if (initialIntent === 'account') {
      intentHandled.current = true;
      return;
    }
    intentHandled.current = true;
    if (scoopAuthedRef.current) return;

    // Light-shell Join SCOOP → mark intent; open Connect unless wallet already live.
    joinIntentRef.current = true;
    autoSiweAddressRef.current = null;
    setJoinError(null);

    const walletReadyNow =
      status === 'connected' &&
      isConnected &&
      Boolean(address) &&
      Boolean(connector);

    if (walletReadyNow && address) {
      autoSiweAddressRef.current = address;
      setJoinPhase('wallet_connected_pending_siwe');
      void runSiweRef.current(address);
      return;
    }

    setJoinPhase('opening_wallet');
    open({ view: 'Connect' });
    // Intentionally omit runSiwe from deps — use ref to avoid effect churn missing open().
  }, [initialIntent, open, address, isConnected, status, connector]);

  // Intent-gated post-connect SIWE (at most once per address per Join intent).
  useEffect(() => {
    if (!joinIntentRef.current) return;
    if (siweInFlightRef.current) return;
    if (scoopAuthedRef.current) return;

    const connected =
      status === 'connected' && isConnected && typeof address === 'string';
    if (!connected || !address || !connector) return;
    if (autoSiweAddressRef.current === address) return;

    let cancelled = false;
    void (async () => {
      const session = await fetchScoopAuthStatus();
      if (cancelled || !joinIntentRef.current) return;

      const reconciliation = resolveScoopAuthState({
        sessionAuthenticated: session.authenticated,
        sessionAddress: session.authenticated ? session.address : null,
        connected: true,
        connectedAddress: address,
      });

      if (reconciliation === 'authenticated_match') {
        joinIntentRef.current = false;
        autoSiweAddressRef.current = null;
        setJoinPhase('authenticated');
        await refreshChrome();
        return;
      }

      if (
        !shouldAutoStartSiwe({
          joinIntentActive: joinIntentRef.current,
          walletConnected: true,
          reconciliation,
          siweInFlight: siweInFlightRef.current,
        })
      ) {
        return;
      }

      autoSiweAddressRef.current = address;
      setJoinPhase('wallet_connected_pending_siwe');
      await runSiwe(address);
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, status, connector, refreshChrome, runSiwe]);

  // AppKit cancelled before wallet connect → clear Connecting… back to Join SCOOP.
  useEffect(() => {
    const wasOpen = modalWasOpenRef.current;
    if (modalOpen) {
      modalWasOpenRef.current = true;
      return;
    }

    const walletConnecting =
      status === 'connecting' || status === 'reconnecting';
    const walletConnected =
      status === 'connected' && isConnected && Boolean(address);

    if (
      shouldResetJoinAfterModalClose({
        modalWasOpen: wasOpen,
        modalOpen: false,
        walletConnected,
        walletConnecting,
        appKitConnectingWallet: Boolean(connectingWallet),
        siweInFlight: siweInFlightRef.current,
        scoopAuthed: scoopAuthedRef.current,
        joinPhase,
      })
    ) {
      joinIntentRef.current = false;
      autoSiweAddressRef.current = null;
      setJoinPhase('idle');
      setJoinError(null);
    }

    if (wasOpen) {
      modalWasOpenRef.current = false;
    }
  }, [modalOpen, connectingWallet, joinPhase, isConnected, status, address]);

  useEffect(() => {
    void refreshChrome();
  }, [address, isConnected, status, refreshChrome]);

  useEffect(() => {
    return subscribeScoopAuthChanged((detail) => {
      if (detail.reason === 'signout') {
        // Invalidate every in-flight refresh that could resurrect A after cookie lag.
        signedOutGuardRef.current = true;
        authEpochRef.current += 1;
        refreshGen.current += 1;
        clearAuthenticatedChrome();
        return;
      }

      if (detail.reason === 'signin') {
        signedOutGuardRef.current = false;
        void refreshChrome();
        return;
      }

      if (detail.reason === 'profile' && detail.profile) {
        const snapshot = detail.profile;
        void (async () => {
          if (signedOutGuardRef.current) return;
          const epoch = authEpochRef.current;
          const session = await fetchScoopAuthStatus();
          if (epoch !== authEpochRef.current) return;
          if (signedOutGuardRef.current) return;
          if (!session.authenticated) return;
          // Never paint another user's profile into this shell.
          if (session.userId !== snapshot.userId) return;
          profileUserIdRef.current = session.userId;
          setScoopAuthed(true);
          setSessionAddress(session.address);
          setProfile({
            displayName: snapshot.displayName,
            avatarUrl: snapshot.avatarUrl,
          });
          await refreshChrome({ soft: true });
        })();
        return;
      }

      void refreshChrome();
    });
  }, [clearAuthenticatedChrome, refreshChrome]);

  const connecting = status === 'connecting' || status === 'reconnecting';
  const walletReady = mounted && isConnected && Boolean(address);
  const sessionShort = shortenSession(sessionAddress);

  const unsignedLabel = joinShellLabel({
    phase: joinPhase === 'authenticated' ? 'idle' : joinPhase,
    walletConnecting: connecting,
    walletConnected: walletReady,
    errorMessage: joinError,
  });

  async function onUnsignedClick() {
    if (connecting || siweInFlightRef.current) return;
    if (scoopAuthedRef.current) {
      window.location.assign('/account');
      return;
    }

    // Recovery: already connected → retry SIWE without reopening AppKit.
    if (walletReady && address) {
      if (joinPhase === 'needs_finish' || joinPhase === 'failed' || joinPhase === 'idle') {
        beginJoinIntent({ openConnectIfNeeded: false });
        return;
      }
    }

    beginJoinIntent({ openConnectIfNeeded: true });
  }

  if (variant === 'mobile') {
    if (scoopAuthed) {
      const title = profile.displayName || sessionShort || 'Account';
      const subtitle = profile.displayName && sessionShort ? sessionShort : null;
      return (
        <AccountChromeMobile
          title={title}
          subtitle={subtitle}
          avatarUrl={profile.avatarUrl}
          displayName={profile.displayName}
          walletReady={walletReady}
          address={address}
        />
      );
    }

    const busy =
      connecting ||
      joinPhase === 'opening_wallet' ||
      joinPhase === 'siwe_in_progress' ||
      joinPhase === 'wallet_connected_pending_siwe';

    return (
      <div className="flex max-w-[12rem] flex-col items-end gap-1">
        <button
          type="button"
          disabled={busy}
          data-wallet-connected={walletReady ? 'true' : 'false'}
          data-wallet-address={walletReady ? address : undefined}
          data-wallet-runtime="ready"
          data-scoop-authed="false"
          data-join-phase={joinPhase}
          onClick={() => void onUnsignedClick()}
          className="inline-flex min-h-10 max-w-[12rem] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
          title={
            joinPhase === 'failed' && joinError
              ? joinError
              : unsignedLabel
          }
          aria-label={unsignedLabel}
        >
          <span className="truncate">{unsignedLabel}</span>
          {!busy ? (
            <ChevronAffordance className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
          ) : null}
        </button>
        {joinPhase === 'failed' && joinError ? (
          <p className="text-right font-mono text-[10px] text-[#b42318]" role="alert">
            Could not finish signing in.
          </p>
        ) : null}
      </div>
    );
  }

  if (scoopAuthed) {
    return (
      <AccountChromeSidebar
        avatarUrl={profile.avatarUrl}
        displayName={profile.displayName}
        sessionShort={sessionShort}
        walletReady={walletReady}
        address={address}
      />
    );
  }

  const sidebarBusy =
    connecting ||
    joinPhase === 'opening_wallet' ||
    joinPhase === 'siwe_in_progress' ||
    joinPhase === 'wallet_connected_pending_siwe';
  const sidebarCaption =
    joinPhase === 'siwe_in_progress' || joinPhase === 'wallet_connected_pending_siwe'
      ? 'Confirming…'
      : joinPhase === 'opening_wallet' || connecting
        ? '…'
        : walletReady
          ? 'Sign in'
          : 'Join';

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={sidebarBusy}
        data-wallet-connected={walletReady ? 'true' : 'false'}
        data-wallet-address={walletReady ? address : undefined}
        data-wallet-runtime="ready"
        data-scoop-authed="false"
        data-join-phase={joinPhase}
        onClick={() => void onUnsignedClick()}
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--divider)] transition-colors hover:border-[var(--fg)] disabled:opacity-50"
        aria-label={unsignedLabel}
        title={
          joinPhase === 'failed' && joinError ? joinError : unsignedLabel
        }
      >
        <span className="relative flex h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset; Image also fine */}
          <Image
            src={SCOOP_AVATAR_SRC}
            alt=""
            width={48}
            height={48}
            className={`h-full w-full object-cover transition-opacity ${sidebarBusy ? 'opacity-50' : ''}`}
            priority
          />
          {sidebarBusy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/35 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg)]">
              …
            </span>
          ) : null}
        </span>
      </button>
      <span className="max-w-[4.5rem] truncate text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {sidebarCaption}
      </span>
    </div>
  );
}
