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
 * Launch-assist may generate concepts/artwork only with a live reconciled wallet.
 * session_only remains a valid SCOOP account state — but not for this flow.
 */
export function launchAssistMayProceed(
  state: ScoopAuthReconciliationState,
): boolean {
  return state === 'authenticated_match';
}

/**
 * True when the connected wallet still needs a fresh SIWE (not merely connect).
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

export function launchAssistAuthTitle(
  state: ScoopAuthReconciliationState,
): string {
  if (state === 'session_only') return 'Connect a wallet to launch';
  if (state === 'wallet_mismatch') {
    return "You're connected with a different wallet";
  }
  return 'Connect a wallet to make a market';
}

export function launchAssistAuthMessage(
  state: ScoopAuthReconciliationState,
): string {
  if (state === 'session_only') {
    return 'Your SCOOP session is still active, but a connected wallet is required to create and launch a token.';
  }
  if (state === 'wallet_mismatch') {
    return "You're connected with a different wallet. Sign in with this wallet to continue.";
  }
  return 'Sign in with your wallet to use launch assist.';
}
