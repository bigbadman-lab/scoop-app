import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchScoopAuthStatus,
  isSignerUnavailableError,
  isUserCancellationError,
  requestSiweSession,
} from '@/lib/auth/siwe-session-client';

const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ADDRESS_LOWER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const HUMAN_LOWER = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';
const HUMAN_MIXED = '0x2e7A710bf18ebe437f6f2df867e346917e2b274c';
const OTHER = '0x1111111111111111111111111111111111111111';
const USER_ID = '8ec2f8c8-1eeb-486d-835b-bd28634d0038';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubWindow() {
  vi.stubGlobal('window', {
    location: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  });
}

function mockAuthFetch(opts?: {
  sessionAddress?: string;
  verifyStatus?: number;
  verifyBody?: Record<string, unknown>;
  verifyAddress?: string;
}) {
  const nonces: string[] = [];
  let verifyCalls = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/nonce')) {
      const nonce = `abcd${nonces.length + 1}ef0123456789abcdef`;
      nonces.push(nonce);
      return Response.json({ nonce });
    }
    if (url.includes('/api/auth/verify')) {
      verifyCalls += 1;
      if (opts?.verifyStatus && opts.verifyStatus >= 400) {
        return Response.json(
          opts.verifyBody ?? { ok: false, code: 'SIWE_VERIFY_FAILED' },
          { status: opts.verifyStatus },
        );
      }
      return Response.json({
        ok: true,
        authenticated: true,
        userId: USER_ID,
        address: opts?.verifyAddress ?? ADDRESS_LOWER,
        chainId: 4663,
        ...(opts?.verifyBody ?? {}),
      });
    }
    if (url.includes('/api/auth/session')) {
      return Response.json({
        authenticated: true,
        userId: USER_ID,
        address: opts?.sessionAddress ?? opts?.verifyAddress ?? ADDRESS_LOWER,
        chainId: 4663,
      });
    }
    return new Response('missing', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, nonces, getVerifyCalls: () => verifyCalls };
}

describe('error classifiers', () => {
  it('keeps cancellation distinct from signer unavailable', () => {
    expect(isUserCancellationError({ code: 4001 })).toBe(true);
    expect(isSignerUnavailableError({ code: 4001 })).toBe(false);
    expect(
      isSignerUnavailableError({ name: 'ConnectorNotConnectedError', message: 'not connected' }),
    ).toBe(true);
  });
});

describe('requestSiweSession pre-sign gate', () => {
  it('matches checksummed vs lowercase connected address and invokes signer', async () => {
    stubWindow();
    const { getVerifyCalls, nonces } = mockAuthFetch({
      verifyAddress: HUMAN_LOWER,
      sessionAddress: HUMAN_LOWER,
    });
    const sign = vi.fn(async (args: { message: string }) => {
      expect(args).toEqual({ message: expect.any(String) });
      expect('account' in args).toBe(false);
      return '0xsig';
    });

    const result = await requestSiweSession(HUMAN_LOWER, sign, 4663, {
      connectedAddress: HUMAN_MIXED,
    });

    expect(result.ok).toBe(true);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(getVerifyCalls()).toBe(1);
    expect(nonces).toHaveLength(1);
  });

  it('fails closed on true address mismatch without signing or verify', async () => {
    stubWindow();
    const { getVerifyCalls } = mockAuthFetch();
    const sign = vi.fn(async () => '0xsig');
    const result = await requestSiweSession(ADDRESS, sign, 4663, {
      connectedAddress: OTHER,
    });
    expect(result).toMatchObject({ ok: false, code: 'SIGNER_ACCOUNT_MISMATCH' });
    expect(sign).not.toHaveBeenCalled();
    expect(getVerifyCalls()).toBe(0);
  });

  it('sends embedded walletType/provider on verify for email AUTH', async () => {
    stubWindow();
    const { fetchMock } = mockAuthFetch();
    const sign = vi.fn(async () => '0xsig');

    const result = await requestSiweSession(ADDRESS, sign, 4663, {
      connectedAddress: ADDRESS,
      walletType: 'embedded',
      provider: 'reown_email',
    });

    expect(result.ok).toBe(true);
    const verifyCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/auth/verify'),
    );
    expect(verifyCall).toBeTruthy();
    const body = JSON.parse(String((verifyCall?.[1] as RequestInit)?.body ?? '{}')) as {
      walletType?: string;
      provider?: string;
    };
    expect(body.walletType).toBe('embedded');
    expect(body.provider).toBe('reown_email');
  });

  it('first SIWE: nonce → sign invoked → verify called', async () => {
    stubWindow();
    const { getVerifyCalls } = mockAuthFetch();
    const steps: string[] = [];
    const sign = vi.fn(async () => '0xsig');

    const result = await requestSiweSession(ADDRESS, sign, 4663, {
      connectedAddress: ADDRESS,
      onStep: (step) => steps.push(step),
    });

    expect(result.ok).toBe(true);
    expect(steps).toEqual(
      expect.arrayContaining([
        'address_check_ok',
        'nonce_ok',
        'signer_ready',
        'sign_invoked',
        'sign_resolved',
        'verify_called',
        'session_ok',
      ]),
    );
    expect(steps.indexOf('sign_invoked')).toBeLessThan(steps.indexOf('verify_called'));
    expect(getVerifyCalls()).toBe(1);
  });

  it('repeat SIWE uses fresh nonce and same userId', async () => {
    stubWindow();
    const { nonces, getVerifyCalls } = mockAuthFetch();
    const sign = vi.fn(async () => '0xsig');

    const first = await requestSiweSession(ADDRESS, sign, 4663, {
      connectedAddress: ADDRESS_LOWER,
    });
    const second = await requestSiweSession(ADDRESS_LOWER, sign, 4663, {
      connectedAddress: ADDRESS,
    });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.userId).toBe(first.userId);
    expect(nonces).toHaveLength(2);
    expect(nonces[0]).not.toBe(nonces[1]);
    expect(getVerifyCalls()).toBe(2);
  });

  it('maps signer unavailable without calling verify', async () => {
    stubWindow();
    const { getVerifyCalls } = mockAuthFetch();
    const result = await requestSiweSession(
      ADDRESS,
      async () => {
        throw { name: 'ConnectorNotConnectedError', message: 'Connector not connected' };
      },
      4663,
      { connectedAddress: ADDRESS },
    );
    expect(result).toMatchObject({ ok: false, code: 'SIGNER_UNAVAILABLE' });
    expect(getVerifyCalls()).toBe(0);
  });

  it('maps pre-popup signer throw to SIGNER_INVOCATION_FAILED not SIWE_VERIFY_FAILED', async () => {
    stubWindow();
    const { getVerifyCalls } = mockAuthFetch();
    const result = await requestSiweSession(
      ADDRESS,
      async () => {
        throw new Error('provider bridge failed');
      },
      4663,
      { connectedAddress: ADDRESS },
    );
    expect(result).toMatchObject({ ok: false, code: 'SIGNER_INVOCATION_FAILED' });
    expect(getVerifyCalls()).toBe(0);
  });

  it('maps user cancellation after signer invoke', async () => {
    stubWindow();
    mockAuthFetch();
    const result = await requestSiweSession(
      ADDRESS,
      async () => {
        throw { code: 4001, message: 'User rejected the request' };
      },
      4663,
      { connectedAddress: ADDRESS },
    );
    expect(result).toMatchObject({ ok: false, code: 'USER_CANCELLED' });
  });

  it('maps verify rejection to SIWE_VERIFY_FAILED after signature exists', async () => {
    stubWindow();
    mockAuthFetch({
      verifyStatus: 401,
      verifyBody: { ok: false, code: 'SIWE_VERIFY_FAILED', error: 'bad sig' },
    });
    const result = await requestSiweSession(ADDRESS, async () => '0xsig', 4663, {
      connectedAddress: ADDRESS,
    });
    expect(result).toMatchObject({ ok: false, code: 'SIWE_VERIFY_FAILED' });
  });
});

describe('fetchScoopAuthStatus', () => {
  it('requires canonical userId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          authenticated: true,
          address: ADDRESS_LOWER,
          chainId: 4663,
        }),
      ),
    );
    await expect(fetchScoopAuthStatus()).resolves.toEqual({ authenticated: false });
  });
});
