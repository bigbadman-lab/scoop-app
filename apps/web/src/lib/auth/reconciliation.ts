import { addressesEqual } from '@/lib/auth/address';

export type ScoopAuthReconciliationState =
  | 'signed_out'
  | 'session_only'
  | 'connected_unsigned'
  | 'authenticated_match'
  | 'wallet_mismatch';

export type ResolveScoopAuthStateInput = {
  sessionAuthenticated: boolean;
  sessionAddress: string | null | undefined;
  connected: boolean;
  connectedAddress: string | null | undefined;
};

/**
 * Canonical client wallet/session reconciliation.
 * Session identity and live signer stay distinct.
 */
export function resolveScoopAuthState(
  input: ResolveScoopAuthStateInput,
): ScoopAuthReconciliationState {
  const hasSession =
    input.sessionAuthenticated &&
    typeof input.sessionAddress === 'string' &&
    input.sessionAddress.length > 0;
  const hasWallet =
    input.connected &&
    typeof input.connectedAddress === 'string' &&
    input.connectedAddress.length > 0;

  if (!hasSession && !hasWallet) return 'signed_out';
  if (hasSession && !hasWallet) return 'session_only';
  if (!hasSession && hasWallet) return 'connected_unsigned';

  // Both present — compare case-insensitively.
  if (addressesEqual(input.sessionAddress!, input.connectedAddress!)) {
    return 'authenticated_match';
  }
  return 'wallet_mismatch';
}

/**
 * Launch-assist / wallet-driven actions may proceed only when session is valid
 * and there is no conflicting live wallet.
 *
 * - authenticated_match → proceed
 * - session_only → proceed (session survives disconnect; no conflicting signer)
 * - wallet_mismatch / connected_unsigned / signed_out → require SIWE
 */
export function launchAssistRequiresSiwe(
  state: ScoopAuthReconciliationState,
): boolean {
  return (
    state === 'wallet_mismatch' ||
    state === 'connected_unsigned' ||
    state === 'signed_out'
  );
}

export function launchAssistAuthMessage(
  state: ScoopAuthReconciliationState,
): string {
  if (state === 'wallet_mismatch') {
    return "You're connected with a different wallet. Sign in with this wallet to continue.";
  }
  return 'Sign in with your wallet to use launch assist.';
}
