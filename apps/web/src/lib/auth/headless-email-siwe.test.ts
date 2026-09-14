/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getW3mSecureIframe,
  hideW3mSecureIframe,
  isApproveTransactionView,
  showW3mSecureIframe,
} from '@/lib/auth/headless-secure-iframe';
import {
  INITIAL_SCOOP_AUTH_STATE,
  reduceScoopAuth,
} from '@/lib/auth/scoop-auth-machine';
import { shouldResetJoinAfterScoopAuthDismiss } from '@/lib/auth/join-flow';
import { shouldAutoStartSiwe } from '@/lib/auth/join-flow';

describe('headless secure iframe helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('identifies ApproveTransaction view', () => {
    expect(isApproveTransactionView('ApproveTransaction')).toBe(true);
    expect(isApproveTransactionView('Connect')).toBe(false);
  });

  it('shows and hides #w3m-iframe like ApproveTransaction', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'w3m-iframe';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    expect(getW3mSecureIframe()).toBe(iframe);
    expect(showW3mSecureIframe()).toBe(true);
    expect(iframe.style.display).toBe('block');
    expect(iframe.style.position).toBe('fixed');

    hideW3mSecureIframe();
    expect(iframe.style.display).toBe('none');
  });

  it('returns false when iframe is missing', () => {
    expect(showW3mSecureIframe()).toBe(false);
  });
});

describe('headless email SIWE ordering regression', () => {
  it('does not mark authenticated before SIWE / session steps', () => {
    let state = reduceScoopAuth(INITIAL_SCOOP_AUTH_STATE, { type: 'OPEN' });
    state = reduceScoopAuth(state, { type: 'CHOOSE_EMAIL' });
    state = reduceScoopAuth(state, {
      type: 'EMAIL_CHANGE',
      email: 'you@example.com',
    });
    state = reduceScoopAuth(state, { type: 'EMAIL_SUBMIT' });
    state = reduceScoopAuth(state, {
      type: 'EMAIL_RESULT',
      action: 'VERIFY_OTP',
    });
    state = reduceScoopAuth(state, { type: 'OTP_CHANGE', otp: '123456' });
    state = reduceScoopAuth(state, { type: 'OTP_SUBMIT' });
    state = reduceScoopAuth(state, { type: 'OTP_OK' });
    expect(state.phase).toBe('siwe_signing');

    state = reduceScoopAuth(state, { type: 'PROVIDER_CONNECT_START' });
    expect(state.phase).toBe('siwe_signing');
    state = reduceScoopAuth(state, { type: 'PROVIDER_CONNECT_OK' });
    // Critical: connector ready is not SCOOP authenticated.
    expect(state.phase).toBe('siwe_signing');
    expect(state.phase).not.toBe('authenticated');
    expect(state.phase).not.toBe('session_creating');
  });

  it('auto-SIWE only after join intent + connected unsigned (ordering)', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: false,
        reconciliation: 'connected_unsigned',
        siweInFlight: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'connected_unsigned',
        siweInFlight: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'connected_unsigned',
        siweInFlight: true,
      }),
    ).toBe(false);
  });

  it('SIWE failure never authenticates and leaves Confirming dismissable', () => {
    let state = {
      ...INITIAL_SCOOP_AUTH_STATE,
      phase: 'siwe_signing' as const,
      email: 'you@example.com',
    };
    state = reduceScoopAuth(state, {
      type: 'SIWE_FAIL',
      message: 'Could not finish signing in.',
    });
    expect(state.phase).toBe('error');
    expect(state.phase).not.toBe('authenticated');

    expect(
      shouldResetJoinAfterScoopAuthDismiss({
        outcome: 'cancelled',
        walletConnected: true,
        walletConnecting: false,
        appKitConnectingWallet: false,
        siweInFlight: false,
        scoopAuthed: false,
        joinPhase: 'siwe_in_progress',
      }),
    ).toBe(true);
  });

  it('signature rejection path stays unauthenticated', () => {
    let state = {
      ...INITIAL_SCOOP_AUTH_STATE,
      phase: 'siwe_signing' as const,
      email: 'you@example.com',
    };
    state = reduceScoopAuth(state, {
      type: 'SIWE_FAIL',
      message: 'Sign-in was cancelled.',
    });
    expect(state.phase).toBe('error');
    state = reduceScoopAuth(state, { type: 'RETRY' });
    expect(state.phase).toBe('siwe_signing');
  });
});

describe('requestSiweSession readiness gate (no premature sign)', () => {
  it('fails closed when connected address mismatches sign address', async () => {
    vi.resetModules();
    const { requestSiweSession } = await import('@/lib/auth/siwe-session-client');
    const sign = vi.fn(async () => '0xsig');
    const result = await requestSiweSession(
      '0x1111111111111111111111111111111111111111',
      sign,
      4663,
      {
        connectedAddress: '0x2222222222222222222222222222222222222222',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SIGNER_ACCOUNT_MISMATCH');
    }
    expect(sign).not.toHaveBeenCalled();
  });
});
