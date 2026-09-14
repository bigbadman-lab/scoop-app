'use client';

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { ScoopEmailAuth } from '@/components/auth/ScoopEmailAuth';
import { ScoopWalletConnect } from '@/components/auth/ScoopWalletConnect';
import {
  closeScoopAuthSheet,
  type ScoopConnectOutcome,
} from '@/lib/auth/open-scoop-auth';
import {
  INITIAL_SCOOP_AUTH_STATE,
  reduceScoopAuth,
  type ScoopAuthEvent,
} from '@/lib/auth/scoop-auth-machine';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired when an embedded/external wallet address is ready for SIWE. */
  onWalletReady?: (address: `0x${string}`) => void;
};

function SheetChrome({
  title,
  subtitle,
  children,
  onClose,
  labelledBy,
  describedBy,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
}) {
  return (
    <div
      className="flex w-full max-w-[420px] flex-col overflow-hidden border border-[var(--divider)] bg-[var(--bg-elevated)] text-[var(--fg)] shadow-[0_24px_64px_rgba(0,0,0,0.45)] max-h-[min(92dvh,640px)] rounded-t-[var(--radius-lg)] border-b-0 sm:max-h-[min(92vh,640px)] sm:rounded-[var(--radius-md)] sm:border-b"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--divider)] px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h2
            id={labelledBy}
            className="text-base font-semibold tracking-tight text-[var(--fg)] sm:text-lg"
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              id={describedBy}
              className="mt-1 text-sm text-[var(--muted)]"
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] font-mono text-[16px] text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)] sm:h-9 sm:w-9 sm:text-[14px]"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
        {children}
      </div>
    </div>
  );
}

/**
 * SCOOP-native auth surface (email + wallet). No Reown modal chrome.
 * Mobile: bottom sheet. Desktop: centered card.
 */
export function ScoopAuthSheet({ open, onClose, onWalletReady }: Props) {
  const titleId = useId();
  const descId = useId();
  const [state, dispatch] = useReducer(reduceScoopAuth, INITIAL_SCOOP_AUTH_STATE);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      dispatch({ type: 'OPEN' });
    } else {
      dispatch({ type: 'CLOSE' });
    }
  }, [open]);

  const close = useCallback(
    (outcome: ScoopConnectOutcome = 'cancelled') => {
      closeScoopAuthSheet({ outcome });
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusable = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close('cancelled');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, close]);

  const send = useCallback((event: ScoopAuthEvent) => {
    dispatch(event);
  }, []);

  if (!open || state.phase === 'idle') return null;

  const title =
    state.phase === 'wallet_select' || state.phase === 'wallet_connecting'
      ? 'Connect Wallet'
      : state.phase === 'otp_enter' ||
          state.phase === 'otp_verifying' ||
          state.phase === 'email_sending'
        ? 'Check your email'
        : state.phase === 'device_approving'
          ? 'Approve this device'
          : state.phase === 'siwe_signing' ||
              state.phase === 'session_creating' ||
              state.phase === 'authenticated'
            ? 'Finishing sign-in'
            : 'Join SCOOP';

  const subtitle =
    state.phase === 'entry' || state.phase === 'email_enter'
      ? 'Sign in with email or connect an external wallet.'
      : state.phase === 'otp_enter' || state.phase === 'otp_verifying'
        ? `We sent a code to ${state.email || 'your email'}`
        : state.phase === 'device_approving'
          ? 'Confirm this browser in the secure Reown prompt. We will ask for a code next.'
          : state.phase === 'siwe_signing' || state.phase === 'session_creating'
            ? 'Approve the sign-in message to finish.'
            : state.phase === 'wallet_select'
              ? 'Choose a wallet to continue.'
              : null;

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-end justify-center px-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Dismiss sign-in"
        onClick={() => close('cancelled')}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        className="relative z-[1] w-full max-w-[420px] px-0 sm:w-auto sm:px-0"
      >
        <SheetChrome
          title={title}
          subtitle={subtitle}
          onClose={() => close('cancelled')}
          labelledBy={titleId}
          describedBy={subtitle ? descId : undefined}
        >
          {state.phase === 'entry' ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => send({ type: 'CHOOSE_EMAIL' })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90"
              >
                Continue with email
              </button>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--divider)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  or
                </span>
                <span className="h-px flex-1 bg-[var(--divider)]" />
              </div>
              <button
                type="button"
                onClick={() => send({ type: 'CHOOSE_WALLET' })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
              >
                Connect Wallet
              </button>
            </div>
          ) : null}

          {state.phase === 'email_enter' ||
          state.phase === 'email_sending' ||
          state.phase === 'otp_enter' ||
          state.phase === 'otp_verifying' ||
          state.phase === 'device_approving' ||
          state.phase === 'siwe_signing' ||
          state.phase === 'session_creating' ||
          state.phase === 'error' ? (
            <ScoopEmailAuth
              state={state}
              dispatch={send}
              onWalletReady={(address) => {
                // Wallet/provider is ready — Join auto-SIWE owns the signature.
                // Do not mark authenticated or close; wait for scoop:auth-changed signin.
                onWalletReady?.(address);
                send({ type: 'SIWE_START' });
              }}
              onBackEntry={() => send({ type: 'BACK_TO_ENTRY' })}
            />
          ) : null}

          {state.phase === 'wallet_select' ||
          state.phase === 'wallet_connecting' ? (
            <ScoopWalletConnect
              connecting={state.phase === 'wallet_connecting'}
              error={state.error}
              onBack={() => send({ type: 'BACK_TO_ENTRY' })}
              onConnecting={() => send({ type: 'WALLET_CONNECT_START' })}
              onConnected={(address) => {
                send({ type: 'WALLET_CONNECT_OK' });
                onWalletReady?.(address);
                send({ type: 'SIWE_START' });
                // External wallets use their own signing UI; sheet can settle
                // as completed so Join intent is not cancelled on late dismiss.
                close('completed');
              }}
              onCancelled={() => send({ type: 'WALLET_CONNECT_CANCEL' })}
              onFailed={(message) =>
                send({ type: 'WALLET_CONNECT_FAIL', message })
              }
            />
          ) : null}

          {state.phase === 'authenticated' ? (
            <p className="font-mono text-[12px] text-[var(--muted)]">
              Signed in. Closing…
            </p>
          ) : null}
        </SheetChrome>
      </div>
    </div>
  );
}
