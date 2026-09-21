import { describe, expect, it, vi } from 'vitest';
import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';
import {
  closeScoopAuthSheet,
  getScoopConnectNamespace,
  isScoopAuthSheetOpen,
  isScoopConnectRequestPending,
  openScoopAuthSheet,
  requestScoopConnect,
  settleScoopConnectRequest,
  subscribeScoopAuthSheet,
  subscribeScoopConnectRequest,
} from '@/lib/auth/open-scoop-auth';
import {
  reownConnectAuthExternal,
  reownConnectEmail,
  reownConnectOtp,
  waitForAuthProvider,
  type ScoopW3mFrameProvider,
} from '@/lib/auth/reown-email-headless';
import {
  INITIAL_SCOOP_AUTH_STATE,
  isValidScoopEmail,
  reduceScoopAuth,
} from '@/lib/auth/scoop-auth-machine';
import { resolveOnChainWalletCapability } from '@/lib/account/onchain-policy';
import { resolveSiweWalletMeta } from '@/lib/auth/wallet-origin';

describe('isScoopCustomAuthUiEnabled', () => {
  it('is false when unset', () => {
    expect(isScoopCustomAuthUiEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is true only for exact "1"', () => {
    expect(
      isScoopCustomAuthUiEnabled({
        NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isScoopCustomAuthUiEnabled({
        NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe('requestScoopConnect', () => {
  it('opens AppKit when flag off', () => {
    const prev = process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    closeScoopAuthSheet();
    const openAppKit = vi.fn();
    requestScoopConnect(openAppKit);
    expect(openAppKit).toHaveBeenCalledTimes(1);
    expect(isScoopAuthSheetOpen()).toBe(false);
    if (prev == null) delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    else process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = prev;
  });

  it('opens SCOOP sheet when flag on', () => {
    const prev = process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = '1';
    closeScoopAuthSheet();
    const openAppKit = vi.fn();
    const seen: boolean[] = [];
    const unsub = subscribeScoopAuthSheet((open) => seen.push(open));
    requestScoopConnect(openAppKit);
    expect(openAppKit).not.toHaveBeenCalled();
    expect(isScoopAuthSheetOpen()).toBe(true);
    expect(isScoopConnectRequestPending()).toBe(true);
    expect(getScoopConnectNamespace()).toBe('eip155');
    expect(seen.at(-1)).toBe(true);
    closeScoopAuthSheet();
    expect(isScoopConnectRequestPending()).toBe(false);
    expect(getScoopConnectNamespace()).toBe('eip155');
    unsub();
    if (prev == null) delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    else process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = prev;
  });

  it('records solana namespace for Pump connect without calling AppKit when flag on', () => {
    const prev = process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = '1';
    closeScoopAuthSheet();
    const openAppKit = vi.fn();
    requestScoopConnect(openAppKit, { namespace: 'solana' });
    expect(openAppKit).not.toHaveBeenCalled();
    expect(getScoopConnectNamespace()).toBe('solana');
    expect(isScoopAuthSheetOpen()).toBe(true);
    closeScoopAuthSheet({ outcome: 'completed' });
    expect(getScoopConnectNamespace()).toBe('eip155');
    if (prev == null) delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    else process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = prev;
  });

  it('passes through to AppKit open when flag off even for solana namespace', () => {
    const prev = process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    closeScoopAuthSheet();
    const openAppKit = vi.fn();
    requestScoopConnect(openAppKit, { namespace: 'solana' });
    expect(openAppKit).toHaveBeenCalledTimes(1);
    expect(isScoopAuthSheetOpen()).toBe(false);
    if (prev == null) delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    else process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = prev;
  });

  it('settles cancelled on dismiss and completed on success without double-cancel', () => {
    const prev = process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = '1';
    closeScoopAuthSheet({ outcome: 'cancelled' });
    const outcomes: string[] = [];
    const unsub = subscribeScoopConnectRequest((event) => {
      if (event.type === 'settled') outcomes.push(event.outcome);
      if (event.type === 'pending') outcomes.push('pending');
    });
    requestScoopConnect(() => undefined);
    expect(outcomes).toContain('pending');
    closeScoopAuthSheet({ outcome: 'cancelled' });
    expect(outcomes.filter((o) => o === 'cancelled')).toHaveLength(1);
    expect(isScoopConnectRequestPending()).toBe(false);

    requestScoopConnect(() => undefined);
    settleScoopConnectRequest('completed');
    expect(outcomes.at(-1)).toBe('completed');
    closeScoopAuthSheet({ outcome: 'cancelled' });
    // Already settled completed — dismiss must not emit another cancel.
    expect(outcomes.filter((o) => o === 'cancelled')).toHaveLength(1);
    unsub();
    if (prev == null) delete process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI;
    else process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI = prev;
  });
});

describe('reduceScoopAuth', () => {
  it('opens directly to wallet_select for solana namespace', () => {
    const state = reduceScoopAuth(INITIAL_SCOOP_AUTH_STATE, {
      type: 'OPEN',
      namespace: 'solana',
    });
    expect(state.phase).toBe('wallet_select');
  });

  it('opens to entry for default eip155 Join', () => {
    const state = reduceScoopAuth(INITIAL_SCOOP_AUTH_STATE, { type: 'OPEN' });
    expect(state.phase).toBe('entry');
  });

  it('email -> OTP', () => {
    let state = reduceScoopAuth(INITIAL_SCOOP_AUTH_STATE, { type: 'OPEN' });
    state = reduceScoopAuth(state, { type: 'CHOOSE_EMAIL' });
    state = reduceScoopAuth(state, {
      type: 'EMAIL_CHANGE',
      email: 'you@example.com',
    });
    state = reduceScoopAuth(state, { type: 'EMAIL_SUBMIT' });
    expect(state.phase).toBe('email_sending');
    state = reduceScoopAuth(state, {
      type: 'EMAIL_RESULT',
      action: 'VERIFY_OTP',
    });
    expect(state.phase).toBe('otp_enter');
  });

  it('email -> device approval then OTP', () => {
    let state = reduceScoopAuth(INITIAL_SCOOP_AUTH_STATE, { type: 'OPEN' });
    state = reduceScoopAuth(state, { type: 'CHOOSE_EMAIL' });
    state = reduceScoopAuth(state, { type: 'EMAIL_SUBMIT' });
    state = reduceScoopAuth(state, {
      type: 'EMAIL_RESULT',
      action: 'VERIFY_DEVICE',
    });
    expect(state.phase).toBe('device_approving');
    state = reduceScoopAuth(state, { type: 'DEVICE_OK' });
    expect(state.phase).toBe('otp_enter');
  });

  it('OTP -> connected path stays on SIWE until authenticated', () => {
    let state = {
      ...INITIAL_SCOOP_AUTH_STATE,
      phase: 'otp_enter' as const,
      email: 'you@example.com',
      otp: '123456',
    };
    state = reduceScoopAuth(state, { type: 'OTP_SUBMIT' });
    state = reduceScoopAuth(state, { type: 'OTP_OK' });
    expect(state.phase).toBe('siwe_signing');
    state = reduceScoopAuth(state, { type: 'PROVIDER_CONNECT_OK' });
    expect(state.phase).toBe('siwe_signing');
    state = reduceScoopAuth(state, { type: 'SIWE_START' });
    expect(state.phase).toBe('siwe_signing');
    state = reduceScoopAuth(state, { type: 'SESSION_START' });
    expect(state.phase).toBe('session_creating');
    state = reduceScoopAuth(state, { type: 'AUTHENTICATED' });
    expect(state.phase).toBe('authenticated');
  });

  it('SIWE reject returns to recoverable error without authenticated', () => {
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
    expect(state.errorReturnPhase).toBe('siwe_signing');
    expect(state.phase).not.toBe('authenticated');
    state = reduceScoopAuth(state, { type: 'RETRY' });
    expect(state.phase).toBe('siwe_signing');
  });

  it('error -> retry returns to prior phase', () => {
    let state = {
      ...INITIAL_SCOOP_AUTH_STATE,
      phase: 'otp_verifying' as const,
      email: 'you@example.com',
      otp: '000000',
    };
    state = reduceScoopAuth(state, {
      type: 'OTP_FAIL',
      message: 'bad code',
    });
    expect(state.phase).toBe('error');
    state = reduceScoopAuth(state, { type: 'RETRY' });
    expect(state.phase).toBe('otp_enter');
    expect(state.error).toBeNull();
  });

  it('validates email shape', () => {
    expect(isValidScoopEmail('you@example.com')).toBe(true);
    expect(isValidScoopEmail('bad')).toBe(false);
  });
});

describe('reown email adapter', () => {
  function mockProvider(
    partial: Partial<ScoopW3mFrameProvider>,
  ): ScoopW3mFrameProvider {
    return {
      connectEmail: vi.fn(),
      connectOtp: vi.fn(),
      connectDevice: vi.fn(),
      connect: vi.fn(),
      getEmail: vi.fn(() => null),
      ...partial,
    };
  }

  it('reports connector unavailable', async () => {
    const result = await waitForAuthProvider({
      resolveConnector: () => undefined,
      attempts: 2,
      intervalMs: 1,
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AUTH_CONNECTOR_UNAVAILABLE');
    }
  });

  it('VERIFY_OTP branch', async () => {
    const provider = mockProvider({
      connectEmail: vi.fn(async () => ({ action: 'VERIFY_OTP' as const })),
    });
    const result = await reownConnectEmail({
      email: 'you@example.com',
      resolveConnector: () => ({ provider }),
      wait: async () => ({ ok: true, provider }),
    });
    expect(result).toEqual({ ok: true, action: 'VERIFY_OTP' });
  });

  it('VERIFY_DEVICE and CONNECT branches', async () => {
    for (const action of ['VERIFY_DEVICE', 'CONNECT'] as const) {
      const provider = mockProvider({
        connectEmail: vi.fn(async () => ({ action })),
      });
      const result = await reownConnectEmail({
        email: 'you@example.com',
        wait: async () => ({ ok: true, provider }),
      });
      expect(result).toEqual({ ok: true, action });
    }
  });

  it('OTP success and failure', async () => {
    const okProvider = mockProvider({
      connectOtp: vi.fn(async () => undefined),
    });
    await expect(
      reownConnectOtp({
        otp: '123456',
        wait: async () => ({ ok: true, provider: okProvider }),
      }),
    ).resolves.toEqual({ ok: true });

    const badProvider = mockProvider({
      connectOtp: vi.fn(async () => {
        throw new Error('invalid otp');
      }),
    });
    const failed = await reownConnectOtp({
      otp: '000000',
      wait: async () => ({ ok: true, provider: badProvider }),
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('OTP_FAILED');
  });

  it('resend is another connectEmail call', async () => {
    const connectEmail = vi.fn(async () => ({ action: 'VERIFY_OTP' as const }));
    const provider = mockProvider({ connectEmail });
    const wait = async () =>
      ({ ok: true as const, provider });
    await reownConnectEmail({ email: 'you@example.com', wait });
    await reownConnectEmail({ email: 'you@example.com', wait });
    expect(connectEmail).toHaveBeenCalledTimes(2);
  });

  it('connectExternal attaches AUTH and returns address', async () => {
    const provider = mockProvider({
      getEmail: vi.fn(() => 'you@example.com'),
    });
    const connectExternal = vi.fn(async () => ({
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }));
    const result = await reownConnectAuthExternal({
      resolveConnector: () => ({ provider, id: 'AUTH', type: 'AUTH' }),
      connectExternal,
      namespace: 'eip155',
    });
    expect(connectExternal).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      email: 'you@example.com',
    });
  });
});

describe('SIWE / embedded gating preserved', () => {
  it('email AUTH maps to embedded + reown_email', () => {
    expect(
      resolveSiweWalletMeta({
        connectorId: 'AUTH',
        embeddedWalletInfo: { authProvider: 'email' },
      }),
    ).toEqual({ walletType: 'embedded', provider: 'reown_email' });
  });

  it('embedded remains blocked from launch/trade', () => {
    const result = resolveOnChainWalletCapability({
      authenticated: true,
      walletType: 'embedded',
    });
    expect(result.mayBroadcastOnChain).toBe(false);
    expect(result.reason).toBe('embedded_blocked');
  });

  it('external remains eligible', () => {
    expect(
      resolveOnChainWalletCapability({
        authenticated: true,
        walletType: 'external',
      }).mayBroadcastOnChain,
    ).toBe(true);
  });
});

describe('openScoopAuthSheet pubsub', () => {
  it('notifies subscribers', () => {
    closeScoopAuthSheet();
    const seen: boolean[] = [];
    const unsub = subscribeScoopAuthSheet((v) => seen.push(v));
    openScoopAuthSheet();
    closeScoopAuthSheet();
    unsub();
    expect(seen).toEqual([false, true, false]);
  });
});
