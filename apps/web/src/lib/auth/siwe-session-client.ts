import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { addressesEqual, sessionAddress } from '@/lib/auth/address';
import { notifyScoopAuthChanged } from '@/lib/auth/scoop-auth-events';
import { buildSiweMessage } from '@/lib/auth/siwe-client';

export type ScoopAuthStatus =
  | { authenticated: false }
  | {
      authenticated: true;
      userId: string;
      address: `0x${string}`;
      chainId: number;
      expiresAt?: string;
    };

export type SiweSessionErrorCode =
  | 'USER_CANCELLED'
  | 'NONCE_ERROR'
  | 'SIWE_VERIFY_FAILED'
  | 'IDENTITY_RESOLUTION_FAILED'
  | 'SESSION_CREATE_FAILED'
  | 'SESSION_MISMATCH'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_CHAIN'
  | 'SIGNER_UNAVAILABLE'
  | 'SIGNER_ACCOUNT_MISMATCH'
  | 'SIGNER_INVOCATION_FAILED';

export type SiweSessionResult =
  | {
      ok: true;
      userId: string;
      address: `0x${string}`;
      chainId: number;
    }
  | {
      ok: false;
      code: SiweSessionErrorCode;
      message: string;
    };

export type RequestSiweSessionOptions = {
  /**
   * Active wagmi connected address (ownership check only).
   * Do NOT force this into signMessageAsync — connector-default signing opens the popup.
   */
  connectedAddress?: string;
  /** Persist wallet origin on verify (email embedded vs external). */
  walletType?: 'embedded' | 'external';
  provider?:
    | 'injected'
    | 'walletconnect'
    | 'reown_email'
    | 'auth'
    | 'unknown';
  /** Safe breadcrumb logger for SIWE diagnosis (no secrets). */
  onStep?: (step: string, meta?: Record<string, unknown>) => void;
};

export function isUserCancellationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    name?: unknown;
    code?: unknown;
    shortMessage?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const name = String(e.name ?? '').toLowerCase();
  const code = e.code;
  const text = `${e.shortMessage ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (code === 4001 || code === 'ACTION_REJECTED' || code === 'USER_REJECTED') return true;
  if (name.includes('reject') || name.includes('denied') || name.includes('cancel')) return true;
  if (
    text.includes('user rejected') ||
    text.includes('user denied') ||
    text.includes('rejected the request') ||
    text.includes('request rejected') ||
    text.includes('cancelled') ||
    text.includes('canceled')
  ) {
    return true;
  }
  return false;
}

export function isSignerUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    name?: unknown;
    shortMessage?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const name = String(e.name ?? '').toLowerCase();
  const text = `${e.shortMessage ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (
    name.includes('connectornotconnected') ||
    name.includes('accountnotfound') ||
    name.includes('connectoraccountnotfound')
  ) {
    return true;
  }
  if (
    text.includes('connector not connected') ||
    text.includes('account not found') ||
    text.includes('connector account') ||
    text.includes('no active account') ||
    text.includes('provider not found') ||
    text.includes('missing account')
  ) {
    return true;
  }
  return false;
}

function userMessageForCode(code: SiweSessionErrorCode): string {
  switch (code) {
    case 'USER_CANCELLED':
      return 'Signature cancelled. Try again when ready.';
    case 'NONCE_ERROR':
      return 'Could not start sign-in. Refresh and try again.';
    case 'SIWE_VERIFY_FAILED':
      return 'Could not verify wallet signature. Try again.';
    case 'IDENTITY_RESOLUTION_FAILED':
      return 'Could not resolve your SCOOP account. Try again.';
    case 'SESSION_CREATE_FAILED':
      return 'Could not create your session. Try again.';
    case 'SESSION_MISMATCH':
      return 'Signed wallet did not match the session. Try again.';
    case 'UNSUPPORTED_CHAIN':
      return 'Switch to Robinhood Chain and try again.';
    case 'SIGNER_UNAVAILABLE':
      return 'Wallet signer is not ready. Reconnect and try again.';
    case 'SIGNER_ACCOUNT_MISMATCH':
      return 'Connected wallet does not match the signing account. Reconnect and try again.';
    case 'SIGNER_INVOCATION_FAILED':
      return 'Could not open the wallet signer. Reconnect and try again.';
    case 'NETWORK_ERROR':
    default:
      return 'Network error during sign-in. Try again.';
  }
}

function fail(code: SiweSessionErrorCode, message?: string): SiweSessionResult {
  return { ok: false, code, message: message ?? userMessageForCode(code) };
}

function shorten(address: string): string {
  const normalized = sessionAddress(address);
  if (!normalized) return 'invalid';
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

function emitStep(
  onStep: RequestSiweSessionOptions['onStep'],
  step: string,
  meta?: Record<string, unknown>,
): void {
  onStep?.(step, meta);
  if (typeof window !== 'undefined') {
    console.info('[scoop-siwe]', step, meta ?? {});
  }
}

type SignMessageFn = (args: { message: string }) => Promise<string>;

/**
 * Client SIWE session helper — no AppKit imports (C.1c isolation).
 * Prefer connector-default signMessageAsync({ message }) so first SIWE opens the popup.
 */
export async function requestSiweSession(
  address: string,
  signMessageAsync: SignMessageFn,
  chainId: number = ROBINHOOD_CHAIN_ID,
  options: RequestSiweSessionOptions = {},
): Promise<SiweSessionResult> {
  const onStep = options.onStep;

  // Always authenticate against Robinhood Chain — wallet network ≠ SIWE chain claim.
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    emitStep(onStep, 'chain_rejected', { chainId });
    return fail('UNSUPPORTED_CHAIN');
  }

  const expectedAddress = sessionAddress(address);
  if (!expectedAddress) {
    emitStep(onStep, 'address_invalid');
    return fail('SIGNER_UNAVAILABLE', 'Invalid wallet address.');
  }

  if (options.connectedAddress != null) {
    if (!sessionAddress(options.connectedAddress)) {
      emitStep(onStep, 'connected_address_invalid');
      return fail('SIGNER_UNAVAILABLE');
    }
    if (!addressesEqual(options.connectedAddress, expectedAddress)) {
      emitStep(onStep, 'address_mismatch', {
        expected: shorten(expectedAddress),
        connected: shorten(options.connectedAddress),
      });
      return fail('SIGNER_ACCOUNT_MISMATCH');
    }
  }

  emitStep(onStep, 'address_check_ok', { address: shorten(expectedAddress) });

  let nonce: string;
  try {
    const nonceRes = await fetch('/api/auth/nonce', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!nonceRes.ok) return fail('NONCE_ERROR');
    const body = (await nonceRes.json()) as { nonce?: string };
    if (!body.nonce || typeof body.nonce !== 'string') return fail('NONCE_ERROR');
    nonce = body.nonce;
  } catch {
    return fail('NETWORK_ERROR');
  }

  emitStep(onStep, 'nonce_ok');

  let message: string;
  try {
    message = buildSiweMessage({
      domain: window.location.host,
      address: expectedAddress,
      uri: window.location.origin,
      chainId: ROBINHOOD_CHAIN_ID,
      nonce,
    });
  } catch {
    emitStep(onStep, 'message_build_failed');
    return fail('SIGNER_INVOCATION_FAILED', 'Could not build the sign-in message.');
  }

  emitStep(onStep, 'signer_ready');

  let signature: string;
  try {
    emitStep(onStep, 'sign_invoked');
    // Connector-default signing: do NOT pass explicit account.
    signature = await signMessageAsync({ message });
    emitStep(onStep, 'sign_resolved');
  } catch (error) {
    if (isUserCancellationError(error)) {
      emitStep(onStep, 'sign_cancelled');
      return fail('USER_CANCELLED');
    }
    if (isSignerUnavailableError(error)) {
      emitStep(onStep, 'signer_unavailable');
      return fail('SIGNER_UNAVAILABLE');
    }
    emitStep(onStep, 'sign_invocation_failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    // Verify was never called — do not report SIWE_VERIFY_FAILED.
    return fail('SIGNER_INVOCATION_FAILED');
  }

  let verifyBody: {
    ok?: unknown;
    authenticated?: unknown;
    userId?: unknown;
    address?: unknown;
    chainId?: unknown;
    code?: unknown;
    error?: unknown;
  };
  try {
    emitStep(onStep, 'verify_called');
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        signature,
        ...(options.walletType ? { walletType: options.walletType } : {}),
        ...(options.provider ? { provider: options.provider } : {}),
      }),
    });
    verifyBody = (await verifyRes.json().catch(() => ({}))) as typeof verifyBody;
    if (!verifyRes.ok) {
      const code = typeof verifyBody.code === 'string' ? verifyBody.code : '';
      if (code === 'IDENTITY_RESOLUTION_FAILED' || code === 'USER_DISABLED') {
        return fail('IDENTITY_RESOLUTION_FAILED');
      }
      if (code === 'SESSION_CREATE_FAILED') {
        return fail('SESSION_CREATE_FAILED');
      }
      if (
        code === 'NONCE_ERROR' ||
        (code === 'VALIDATION' && String(verifyBody.error ?? '').toLowerCase().includes('nonce'))
      ) {
        return fail('NONCE_ERROR');
      }
      return fail('SIWE_VERIFY_FAILED');
    }
  } catch {
    return fail('NETWORK_ERROR');
  }

  const verifiedUserId =
    typeof verifyBody.userId === 'string' ? verifyBody.userId.toLowerCase() : null;
  const verifiedAddress =
    typeof verifyBody.address === 'string' ? sessionAddress(verifyBody.address) : null;
  if (!verifiedUserId || !verifiedAddress || verifiedAddress !== expectedAddress) {
    return fail('SESSION_MISMATCH');
  }

  const status = await fetchScoopAuthStatus();
  if (!status.authenticated) return fail('SESSION_CREATE_FAILED');
  if (status.address !== expectedAddress || status.userId !== verifiedUserId) {
    return fail('SESSION_MISMATCH');
  }

  emitStep(onStep, 'session_ok', { userIdPrefix: status.userId.slice(0, 8) });
  notifyScoopAuthChanged({ reason: 'signin' });

  return {
    ok: true,
    userId: status.userId,
    address: status.address,
    chainId: status.chainId,
  };
}

/** Narrow session introspection — never returns cookie/HMAC material. */
export async function fetchScoopAuthStatus(): Promise<ScoopAuthStatus> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return { authenticated: false };
    const data = (await res.json()) as {
      authenticated?: unknown;
      userId?: unknown;
      address?: unknown;
      chainId?: unknown;
      expiresAt?: unknown;
    };
    if (data.authenticated !== true || typeof data.address !== 'string') {
      return { authenticated: false };
    }
    if (typeof data.userId !== 'string' || !data.userId.trim()) {
      return { authenticated: false };
    }
    const address = sessionAddress(data.address);
    if (!address) return { authenticated: false };
    return {
      authenticated: true,
      userId: data.userId.toLowerCase(),
      address,
      chainId: typeof data.chainId === 'number' ? data.chainId : ROBINHOOD_CHAIN_ID,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
    };
  } catch {
    return { authenticated: false };
  }
}
