'use client';

import { useEffect, useRef, useState } from 'react';
import {
  reownConnectAuthExternal,
  reownConnectDevice,
  reownConnectEmail,
  reownConnectOtp,
} from '@/lib/auth/reown-email-headless';
import {
  isValidScoopEmail,
  type ScoopAuthEvent,
  type ScoopAuthState,
} from '@/lib/auth/scoop-auth-machine';

type Props = {
  state: ScoopAuthState;
  dispatch: (event: ScoopAuthEvent) => void;
  onWalletReady: (address: `0x${string}`) => void;
  onBackEntry: () => void;
};

async function finishAuthExternalConnect(
  dispatch: Props['dispatch'],
  onWalletReady: Props['onWalletReady'],
) {
  dispatch({ type: 'PROVIDER_CONNECT_START' });
  const connected = await reownConnectAuthExternal();
  if (!connected.ok) {
    dispatch({
      type: 'PROVIDER_CONNECT_FAIL',
      message: connected.message,
    });
    return;
  }
  dispatch({ type: 'PROVIDER_CONNECT_OK' });
  onWalletReady(connected.address as `0x${string}`);
}

/**
 * Email + OTP + device-approval steps for SCOOP custom auth.
 */
export function ScoopEmailAuth({
  state,
  dispatch,
  onWalletReady,
  onBackEntry,
}: Props) {
  const [localError, setLocalError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const deviceStarted = useRef(false);

  const busy =
    state.phase === 'email_sending' ||
    state.phase === 'otp_verifying' ||
    state.phase === 'device_approving' ||
    state.phase === 'siwe_signing' ||
    state.phase === 'session_creating';

  useEffect(() => {
    if (state.phase !== 'device_approving') {
      deviceStarted.current = false;
      return;
    }
    if (deviceStarted.current) return;
    deviceStarted.current = true;
    void (async () => {
      const result = await reownConnectDevice();
      if (!result.ok) {
        dispatch({ type: 'DEVICE_FAIL', message: result.message });
        return;
      }
      dispatch({ type: 'DEVICE_OK' });
      // Reown: device approval then OTP — do not connectExternal yet.
    })();
  }, [state.phase, dispatch]);

  async function submitEmail() {
    setLocalError(null);
    const email = state.email.trim();
    if (!isValidScoopEmail(email)) {
      setLocalError('Enter a valid email address.');
      return;
    }
    dispatch({ type: 'EMAIL_SUBMIT' });
    const result = await reownConnectEmail({ email });
    if (!result.ok) {
      dispatch({ type: 'EMAIL_FAIL', message: result.message });
      return;
    }
    dispatch({ type: 'EMAIL_RESULT', action: result.action });
    if (result.action === 'CONNECT') {
      await finishAuthExternalConnect(dispatch, onWalletReady);
    }
  }

  async function submitOtp() {
    setLocalError(null);
    if (state.otp.length !== 6) {
      setLocalError('Enter the 6-digit code.');
      return;
    }
    dispatch({ type: 'OTP_SUBMIT' });
    const result = await reownConnectOtp({ otp: state.otp });
    if (!result.ok) {
      dispatch({ type: 'OTP_FAIL', message: result.message });
      return;
    }
    dispatch({ type: 'OTP_OK' });
    await finishAuthExternalConnect(dispatch, onWalletReady);
  }

  function setOtpDigit(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const chars = state.otp.padEnd(6, ' ').split('');
    chars[index] = digit || ' ';
    const next = chars.join('').replace(/ /g, '').slice(0, 6);
    dispatch({ type: 'OTP_CHANGE', otp: next });
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (digit && index === 5 && next.length === 6) {
      // Defer submit so state includes full OTP.
      queueMicrotask(() => {
        void (async () => {
          dispatch({ type: 'OTP_SUBMIT' });
          const result = await reownConnectOtp({ otp: next });
          if (!result.ok) {
            dispatch({ type: 'OTP_FAIL', message: result.message });
            return;
          }
          dispatch({ type: 'OTP_OK' });
          await finishAuthExternalConnect(dispatch, onWalletReady);
        })();
      });
    }
  }

  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    dispatch({ type: 'OTP_CHANGE', otp: pasted });
    const focusAt = Math.min(pasted.length, 5);
    otpRefs.current[focusAt]?.focus();
    if (pasted.length === 6) {
      queueMicrotask(() => {
        void (async () => {
          dispatch({ type: 'OTP_SUBMIT' });
          const result = await reownConnectOtp({ otp: pasted });
          if (!result.ok) {
            dispatch({ type: 'OTP_FAIL', message: result.message });
            return;
          }
          dispatch({ type: 'OTP_OK' });
          await finishAuthExternalConnect(dispatch, onWalletReady);
        })();
      });
    }
  }

  const errorText = localError || state.error;

  if (state.phase === 'error') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#b42318]" role="alert">
          {state.error ?? 'Something went wrong.'}
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RETRY' })}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onBackEntry}
          className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Back
        </button>
      </div>
    );
  }

  if (
    state.phase === 'device_approving' ||
    state.phase === 'siwe_signing' ||
    state.phase === 'session_creating'
  ) {
    const pendingCopy =
      state.phase === 'device_approving'
        ? 'Waiting for device approval in the secure prompt…'
        : state.phase === 'session_creating'
          ? 'Creating your SCOOP session…'
          : 'Approve the sign-in message in the secure prompt to finish.';
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--muted)]">{pendingCopy}</p>
        {errorText ? (
          <p className="text-sm text-[#b42318]" role="alert">
            {errorText}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.phase === 'otp_enter' || state.phase === 'otp_verifying') {
    return (
      <div className="space-y-4">
        <div
          className="flex justify-between gap-2"
          role="group"
          aria-label="One-time code"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <input
              key={i}
              ref={(el) => {
                otpRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={busy}
              value={state.otp[i] ?? ''}
              onChange={(e) => setOtpDigit(i, e.target.value)}
              onPaste={i === 0 ? onOtpPaste : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !state.otp[i] && i > 0) {
                  otpRefs.current[i - 1]?.focus();
                }
              }}
              className="h-12 w-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] text-center font-mono text-lg text-[var(--fg)] outline-none focus:border-[var(--scoop-orange)] disabled:opacity-50"
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>
        {errorText ? (
          <p className="text-sm text-[#b42318]" role="alert">
            {errorText}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || state.otp.length !== 6}
          onClick={() => void submitOtp()}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
        >
          {state.phase === 'otp_verifying' ? 'Verifying…' : 'Verify'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitEmail()}
          className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
        >
          Resend code
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => dispatch({ type: 'BACK_TO_EMAIL' })}
          className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Back
        </button>
      </div>
    );
  }

  // email_enter | email_sending
  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Email
        </span>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          disabled={busy}
          value={state.email}
          onChange={(e) =>
            dispatch({ type: 'EMAIL_CHANGE', email: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitEmail();
            }
          }}
          placeholder="you@example.com"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] px-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--scoop-orange)] disabled:opacity-50"
        />
      </label>
      {errorText ? (
        <p className="text-sm text-[#b42318]" role="alert">
          {errorText}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submitEmail()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] disabled:opacity-40"
      >
        {state.phase === 'email_sending' ? 'Sending…' : 'Continue'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onBackEntry}
        className="inline-flex min-h-10 w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--fg)]"
      >
        Back
      </button>
    </div>
  );
}
