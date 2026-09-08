import { describe, expect, it } from 'vitest';
import {
  launchAssistMayProceed,
  launchAssistRequiresSiwe,
  resolveScoopAuthState,
} from '@/lib/auth/reconciliation';

const A = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';
const B = '0x1111111111111111111111111111111111111111';

/**
 * Lifecycle proofs for C.3d-pre / C.3d-pre-fix.
 */
describe('reconciliation lifecycle', () => {
  it('H: after SIWE for B, session B + wallet B → authenticated_match', () => {
    const before = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: A,
      connected: true,
      connectedAddress: B,
    });
    expect(before).toBe('wallet_mismatch');
    expect(launchAssistMayProceed(before)).toBe(false);
    expect(launchAssistRequiresSiwe(before)).toBe(true);

    const after = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: B,
      connected: true,
      connectedAddress: B,
    });
    expect(after).toBe('authenticated_match');
    expect(launchAssistMayProceed(after)).toBe(true);
  });

  it('I: session_only blocks assist; same-wallet reconnect proceeds without SIWE', () => {
    const disconnected = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: A,
      connected: false,
      connectedAddress: null,
    });
    expect(disconnected).toBe('session_only');
    expect(launchAssistMayProceed(disconnected)).toBe(false);
    expect(launchAssistRequiresSiwe(disconnected)).toBe(false);

    const reconnected = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: A,
      connected: true,
      connectedAddress: A,
    });
    expect(reconnected).toBe('authenticated_match');
    expect(launchAssistMayProceed(reconnected)).toBe(true);
    expect(launchAssistRequiresSiwe(reconnected)).toBe(false);
  });

  it('J: different-wallet reconnect → wallet_mismatch', () => {
    const disconnected = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: A,
      connected: false,
      connectedAddress: null,
    });
    expect(disconnected).toBe('session_only');
    expect(launchAssistMayProceed(disconnected)).toBe(false);

    const other = resolveScoopAuthState({
      sessionAuthenticated: true,
      sessionAddress: A,
      connected: true,
      connectedAddress: B,
    });
    expect(other).toBe('wallet_mismatch');
    expect(launchAssistMayProceed(other)).toBe(false);
    expect(launchAssistRequiresSiwe(other)).toBe(true);
  });
});
