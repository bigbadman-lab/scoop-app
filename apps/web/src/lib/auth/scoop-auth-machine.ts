/**
 * Explicit SCOOP custom-auth UI state machine (Phase A).
 * Pure transitions — no Reown calls here.
 */

export type ScoopAuthPhase =
  | 'idle'
  | 'entry'
  | 'email_enter'
  | 'email_sending'
  | 'otp_enter'
  | 'otp_verifying'
  | 'device_approving'
  | 'wallet_select'
  | 'wallet_connecting'
  | 'siwe_signing'
  | 'session_creating'
  | 'authenticated'
  | 'error';

export type ScoopEmailAction = 'VERIFY_OTP' | 'VERIFY_DEVICE' | 'CONNECT';

export type ScoopAuthState = {
  phase: ScoopAuthPhase;
  email: string;
  otp: string;
  error: string | null;
  /** Last recoverable phase before error (for Retry). */
  errorReturnPhase: ScoopAuthPhase | null;
};

export type ScoopAuthEvent =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'CHOOSE_EMAIL' }
  | { type: 'CHOOSE_WALLET' }
  | { type: 'BACK_TO_ENTRY' }
  | { type: 'BACK_TO_EMAIL' }
  | { type: 'EMAIL_CHANGE'; email: string }
  | { type: 'EMAIL_SUBMIT' }
  | { type: 'EMAIL_RESULT'; action: ScoopEmailAction }
  | { type: 'EMAIL_FAIL'; message: string }
  | { type: 'OTP_CHANGE'; otp: string }
  | { type: 'OTP_SUBMIT' }
  | { type: 'OTP_OK' }
  | { type: 'OTP_FAIL'; message: string }
  | { type: 'DEVICE_START' }
  | { type: 'DEVICE_OK' }
  | { type: 'DEVICE_FAIL'; message: string }
  | { type: 'PROVIDER_CONNECT_START' }
  | { type: 'PROVIDER_CONNECT_OK' }
  | { type: 'PROVIDER_CONNECT_FAIL'; message: string }
  | { type: 'WALLET_CONNECT_START' }
  | { type: 'WALLET_CONNECT_OK' }
  | { type: 'WALLET_CONNECT_FAIL'; message: string }
  | { type: 'WALLET_CONNECT_CANCEL' }
  | { type: 'SIWE_START' }
  | { type: 'SESSION_START' }
  | { type: 'AUTHENTICATED' }
  | { type: 'RETRY' }
  | { type: 'CLEAR_ERROR' };

export const INITIAL_SCOOP_AUTH_STATE: ScoopAuthState = {
  phase: 'idle',
  email: '',
  otp: '',
  error: null,
  errorReturnPhase: null,
};

function fail(
  state: ScoopAuthState,
  message: string,
  returnPhase: ScoopAuthPhase,
): ScoopAuthState {
  return {
    ...state,
    phase: 'error',
    error: message,
    errorReturnPhase: returnPhase,
  };
}

export function reduceScoopAuth(
  state: ScoopAuthState,
  event: ScoopAuthEvent,
): ScoopAuthState {
  switch (event.type) {
    case 'OPEN':
      return {
        ...INITIAL_SCOOP_AUTH_STATE,
        phase: 'entry',
      };
    case 'CLOSE':
      return { ...INITIAL_SCOOP_AUTH_STATE, phase: 'idle' };
    case 'CHOOSE_EMAIL':
      if (state.phase !== 'entry' && state.phase !== 'error') return state;
      return {
        ...state,
        phase: 'email_enter',
        error: null,
        errorReturnPhase: null,
        otp: '',
      };
    case 'CHOOSE_WALLET':
      if (state.phase !== 'entry' && state.phase !== 'error') return state;
      return {
        ...state,
        phase: 'wallet_select',
        error: null,
        errorReturnPhase: null,
      };
    case 'BACK_TO_ENTRY':
      return {
        ...state,
        phase: 'entry',
        error: null,
        errorReturnPhase: null,
        otp: '',
      };
    case 'BACK_TO_EMAIL':
      return {
        ...state,
        phase: 'email_enter',
        error: null,
        errorReturnPhase: null,
        otp: '',
      };
    case 'EMAIL_CHANGE':
      return { ...state, email: event.email, error: null };
    case 'EMAIL_SUBMIT':
      if (state.phase !== 'email_enter' && state.phase !== 'otp_enter') {
        return state;
      }
      return {
        ...state,
        phase: 'email_sending',
        error: null,
        otp: state.phase === 'otp_enter' ? state.otp : '',
      };
    case 'EMAIL_RESULT': {
      if (state.phase !== 'email_sending') return state;
      if (event.action === 'VERIFY_OTP') {
        return { ...state, phase: 'otp_enter', otp: '', error: null };
      }
      if (event.action === 'VERIFY_DEVICE') {
        return { ...state, phase: 'device_approving', error: null };
      }
      return { ...state, phase: 'siwe_signing', error: null };
    }
    case 'EMAIL_FAIL':
      return fail(
        state,
        event.message,
        state.phase === 'email_sending' && state.otp
          ? 'otp_enter'
          : 'email_enter',
      );
    case 'OTP_CHANGE':
      return {
        ...state,
        otp: event.otp.replace(/\D/g, '').slice(0, 6),
        error: null,
      };
    case 'OTP_SUBMIT':
      if (state.phase !== 'otp_enter') return state;
      return { ...state, phase: 'otp_verifying', error: null };
    case 'OTP_OK':
      if (state.phase !== 'otp_verifying') return state;
      return { ...state, phase: 'siwe_signing', error: null };
    case 'OTP_FAIL':
      return fail(state, event.message, 'otp_enter');
    case 'DEVICE_START':
      return { ...state, phase: 'device_approving', error: null };
    case 'DEVICE_OK':
      if (state.phase !== 'device_approving') return state;
      // Reown scaffold: device approval → EmailVerifyOtp (still need OTP).
      return { ...state, phase: 'otp_enter', otp: '', error: null };
    case 'DEVICE_FAIL':
      return fail(state, event.message, 'email_enter');
    case 'PROVIDER_CONNECT_START':
      return { ...state, phase: 'siwe_signing', error: null };
    case 'PROVIDER_CONNECT_OK':
      return { ...state, phase: 'session_creating', error: null };
    case 'PROVIDER_CONNECT_FAIL':
      return fail(state, event.message, 'email_enter');
    case 'WALLET_CONNECT_START':
      if (state.phase !== 'wallet_select' && state.phase !== 'wallet_connecting') {
        return state;
      }
      return { ...state, phase: 'wallet_connecting', error: null };
    case 'WALLET_CONNECT_OK':
      return { ...state, phase: 'siwe_signing', error: null };
    case 'WALLET_CONNECT_FAIL':
      return fail(state, event.message, 'wallet_select');
    case 'WALLET_CONNECT_CANCEL':
      return {
        ...state,
        phase: 'wallet_select',
        error: null,
        errorReturnPhase: null,
      };
    case 'SIWE_START':
      return { ...state, phase: 'siwe_signing', error: null };
    case 'SESSION_START':
      return { ...state, phase: 'session_creating', error: null };
    case 'AUTHENTICATED':
      return {
        ...state,
        phase: 'authenticated',
        error: null,
        errorReturnPhase: null,
      };
    case 'RETRY': {
      const next = state.errorReturnPhase ?? 'entry';
      return {
        ...state,
        phase: next,
        error: null,
        errorReturnPhase: null,
        otp: next === 'otp_enter' ? '' : state.otp,
      };
    }
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function isValidScoopEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  // Practical client check — server/provider still validates.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
