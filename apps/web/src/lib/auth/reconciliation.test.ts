import { describe, expect, it } from 'vitest';
import {
  launchAssistAuthMessage,
  launchAssistRequiresSiwe,
  resolveScoopAuthState,
} from '@/lib/auth/reconciliation';

const A = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';
const A_MIXED = '0x2e7A710bf18ebe437f6f2df867e346917e2b274c';
const B = '0x1111111111111111111111111111111111111111';

describe('resolveScoopAuthState', () => {
  it('signed_out when no session and no wallet', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: false,
        sessionAddress: null,
        connected: false,
        connectedAddress: null,
      }),
    ).toBe('signed_out');
  });

  it('session_only when session exists and wallet disconnected', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: true,
        sessionAddress: A,
        connected: false,
        connectedAddress: null,
      }),
    ).toBe('session_only');
  });

  it('connected_unsigned when wallet connected without session', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: false,
        sessionAddress: null,
        connected: true,
        connectedAddress: A,
      }),
    ).toBe('connected_unsigned');
  });

  it('authenticated_match for same wallet', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: true,
        sessionAddress: A,
        connected: true,
        connectedAddress: A,
      }),
    ).toBe('authenticated_match');
  });

  it('authenticated_match for case-only address differences', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: true,
        sessionAddress: A,
        connected: true,
        connectedAddress: A_MIXED,
      }),
    ).toBe('authenticated_match');
  });

  it('wallet_mismatch for different wallets', () => {
    expect(
      resolveScoopAuthState({
        sessionAuthenticated: true,
        sessionAddress: A,
        connected: true,
        connectedAddress: B,
      }),
    ).toBe('wallet_mismatch');
  });
});

describe('launchAssistRequiresSiwe', () => {
  it('requires SIWE for mismatch/unsigned/signed_out only', () => {
    expect(launchAssistRequiresSiwe('authenticated_match')).toBe(false);
    expect(launchAssistRequiresSiwe('session_only')).toBe(false);
    expect(launchAssistRequiresSiwe('wallet_mismatch')).toBe(true);
    expect(launchAssistRequiresSiwe('connected_unsigned')).toBe(true);
    expect(launchAssistRequiresSiwe('signed_out')).toBe(true);
  });

  it('uses mismatch copy for wallet_mismatch', () => {
    expect(launchAssistAuthMessage('wallet_mismatch')).toMatch(/different wallet/i);
  });
});
