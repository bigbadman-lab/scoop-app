import { describe, expect, it } from 'vitest';
import {
  joinShellLabel,
  shouldAutoStartSiwe,
  shouldResetJoinAfterModalClose,
  shouldResetJoinAfterScoopAuthDismiss,
} from '@/lib/auth/join-flow';

describe('shouldAutoStartSiwe', () => {
  it('starts SIWE for intentional Join + connected_unsigned', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'connected_unsigned',
        siweInFlight: false,
      }),
    ).toBe(true);
  });

  it('starts SIWE for intentional Join + wallet_mismatch', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'wallet_mismatch',
        siweInFlight: false,
      }),
    ).toBe(true);
  });

  it('does not auto-SIWE without Join intent (reconnect protection)', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: false,
        walletConnected: true,
        reconciliation: 'connected_unsigned',
        siweInFlight: false,
      }),
    ).toBe(false);
  });

  it('does not auto-SIWE on authenticated_match', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'authenticated_match',
        siweInFlight: false,
      }),
    ).toBe(false);
  });

  it('does not auto-SIWE while already in flight', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: true,
        reconciliation: 'connected_unsigned',
        siweInFlight: true,
      }),
    ).toBe(false);
  });

  it('does not auto-SIWE when wallet is not connected', () => {
    expect(
      shouldAutoStartSiwe({
        joinIntentActive: true,
        walletConnected: false,
        reconciliation: 'signed_out',
        siweInFlight: false,
      }),
    ).toBe(false);
  });
});

describe('shouldResetJoinAfterModalClose', () => {
  const base = {
    modalWasOpen: true,
    modalOpen: false,
    walletConnected: false,
    walletConnecting: false,
    appKitConnectingWallet: false,
    siweInFlight: false,
    scoopAuthed: false,
    joinPhase: 'opening_wallet' as const,
  };

  it('resets when AppKit closes without a wallet during opening_wallet', () => {
    expect(shouldResetJoinAfterModalClose(base)).toBe(true);
  });

  it('does not reset while modal is still open', () => {
    expect(
      shouldResetJoinAfterModalClose({ ...base, modalOpen: true }),
    ).toBe(false);
  });

  it('does not reset if modal never opened', () => {
    expect(
      shouldResetJoinAfterModalClose({ ...base, modalWasOpen: false }),
    ).toBe(false);
  });

  it('does not reset on successful-connect race (wallet connected or connecting)', () => {
    expect(
      shouldResetJoinAfterModalClose({ ...base, walletConnected: true }),
    ).toBe(false);
    expect(
      shouldResetJoinAfterModalClose({ ...base, walletConnecting: true }),
    ).toBe(false);
    expect(
      shouldResetJoinAfterModalClose({
        ...base,
        appKitConnectingWallet: true,
      }),
    ).toBe(false);
  });

  it('does not reset during SIWE or when already authenticated', () => {
    expect(
      shouldResetJoinAfterModalClose({ ...base, siweInFlight: true }),
    ).toBe(false);
    expect(
      shouldResetJoinAfterModalClose({ ...base, scoopAuthed: true }),
    ).toBe(false);
  });

  it('does not reset Sign in to SCOOP recovery after SIWE cancel', () => {
    expect(
      shouldResetJoinAfterModalClose({
        ...base,
        walletConnected: true,
        joinPhase: 'needs_finish',
      }),
    ).toBe(false);
  });
});

describe('shouldResetJoinAfterScoopAuthDismiss', () => {
  const base = {
    outcome: 'cancelled' as const,
    walletConnected: false,
    walletConnecting: false,
    appKitConnectingWallet: false,
    siweInFlight: false,
    scoopAuthed: false,
    joinPhase: 'opening_wallet' as const,
  };

  it('resets Connecting after sheet dismiss without auth', () => {
    expect(shouldResetJoinAfterScoopAuthDismiss(base)).toBe(true);
  });

  it('does not reset after completed connect', () => {
    expect(
      shouldResetJoinAfterScoopAuthDismiss({
        ...base,
        outcome: 'completed',
      }),
    ).toBe(false);
  });

  it('resets Confirming when dismiss cancels mid-SIWE (even if wallet connected)', () => {
    expect(
      shouldResetJoinAfterScoopAuthDismiss({
        ...base,
        walletConnected: true,
        siweInFlight: true,
        joinPhase: 'siwe_in_progress',
      }),
    ).toBe(true);
    expect(
      shouldResetJoinAfterScoopAuthDismiss({
        ...base,
        walletConnected: true,
        joinPhase: 'wallet_connected_pending_siwe',
      }),
    ).toBe(true);
  });

  it('does not reset recovery chrome after SIWE cancel already settled', () => {
    expect(
      shouldResetJoinAfterScoopAuthDismiss({
        ...base,
        walletConnected: true,
        joinPhase: 'needs_finish',
      }),
    ).toBe(false);
  });
});

describe('joinShellLabel', () => {
  it('shows Sign in when idle and disconnected', () => {
    expect(
      joinShellLabel({
        phase: 'idle',
        walletConnecting: false,
        walletConnected: false,
      }),
    ).toBe('Sign in');
  });

  it('shows Connecting while opening or wagmi connecting', () => {
    expect(
      joinShellLabel({
        phase: 'opening_wallet',
        walletConnecting: false,
        walletConnected: false,
      }),
    ).toBe('Connecting…');
    expect(
      joinShellLabel({
        phase: 'idle',
        walletConnecting: true,
        walletConnected: false,
      }),
    ).toBe('Connecting…');
  });

  it('shows Confirming during SIWE', () => {
    expect(
      joinShellLabel({
        phase: 'siwe_in_progress',
        walletConnecting: false,
        walletConnected: true,
      }),
    ).toBe('Confirming…');
  });

  it('shows Sign in to SCOOP after cancel or connected unsigned', () => {
    expect(
      joinShellLabel({
        phase: 'needs_finish',
        walletConnecting: false,
        walletConnected: true,
      }),
    ).toBe('Sign in to SCOOP');
    expect(
      joinShellLabel({
        phase: 'idle',
        walletConnecting: false,
        walletConnected: true,
      }),
    ).toBe('Sign in to SCOOP');
  });
});
