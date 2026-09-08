import type { ScoopAuthReconciliationState } from '@/lib/auth/reconciliation';

/**
 * Transient Join SCOOP UX phases (shell chrome).
 * Intentional Join ≠ every wallet connect/reconnect.
 */
export type ScoopJoinPhase =
  | 'idle'
  | 'opening_wallet'
  | 'wallet_connected_pending_siwe'
  | 'siwe_in_progress'
  | 'authenticated'
  | 'needs_finish'
  | 'failed';

/**
 * Auto-SIWE only when the user started Join SCOOP and the live wallet
 * is not already reconciled to a matching SCOOP session.
 */
export function shouldAutoStartSiwe(input: {
  joinIntentActive: boolean;
  walletConnected: boolean;
  reconciliation: ScoopAuthReconciliationState;
  siweInFlight: boolean;
}): boolean {
  if (!input.joinIntentActive) return false;
  if (!input.walletConnected) return false;
  if (input.siweInFlight) return false;
  if (input.reconciliation === 'authenticated_match') return false;
  if (input.reconciliation === 'session_only') return false;
  return (
    input.reconciliation === 'connected_unsigned' ||
    input.reconciliation === 'wallet_mismatch' ||
    input.reconciliation === 'signed_out'
  );
}

/**
 * Reset Join intent when AppKit closes without a wallet connection.
 * Must NOT fire on the successful-connect race (modal closes as wallet attaches).
 */
export function shouldResetJoinAfterModalClose(input: {
  modalWasOpen: boolean;
  modalOpen: boolean;
  walletConnected: boolean;
  walletConnecting: boolean;
  appKitConnectingWallet: boolean;
  siweInFlight: boolean;
  scoopAuthed: boolean;
  joinPhase: ScoopJoinPhase;
}): boolean {
  if (!input.modalWasOpen || input.modalOpen) return false;
  if (input.scoopAuthed) return false;
  if (input.walletConnected) return false;
  if (input.walletConnecting) return false;
  if (input.appKitConnectingWallet) return false;
  if (input.siweInFlight) return false;
  return input.joinPhase === 'opening_wallet';
}

/** Primary mobile shell label for unsigned Join chrome. */
export function joinShellLabel(input: {
  phase: ScoopJoinPhase;
  walletConnecting: boolean;
  walletConnected: boolean;
  errorMessage?: string | null;
}): string {
  if (input.phase === 'siwe_in_progress') return 'Confirming…';
  if (input.phase === 'wallet_connected_pending_siwe') return 'Confirming…';
  if (
    input.phase === 'opening_wallet' ||
    input.walletConnecting
  ) {
    return 'Connecting…';
  }
  if (input.phase === 'failed') {
    return input.errorMessage?.trim()
      ? 'Try again'
      : 'Try again';
  }
  if (input.phase === 'needs_finish' || input.walletConnected) {
    return 'Sign in to SCOOP';
  }
  return 'Join SCOOP';
}

export function joinShellAriaLabel(input: {
  phase: ScoopJoinPhase;
  walletConnecting: boolean;
  walletConnected: boolean;
}): string {
  return joinShellLabel({
    ...input,
    errorMessage: null,
  });
}
