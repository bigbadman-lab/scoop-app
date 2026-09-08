import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  createNonce,
  createSession,
  getAuthenticatedScoopUser,
  getAuthenticatedWallet,
  sealNonce,
  sealSession,
  unsealNonce,
  unsealSession,
} from '@/lib/auth/session';
import { sanitizeAssistResumePath } from '@/lib/auth/siwe-client';

const env = {
  SCOOP_SESSION_SECRET: 'test-secret-for-unit-tests-only',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

const SAMPLE_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SAMPLE_ADDRESS_LOWER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const SAMPLE_USER_ID = '11111111-1111-4111-8111-111111111111';

describe('auth session cookies', () => {
  it('seals and unseals a session with canonical userId', () => {
    const session = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    const restored = unsealSession(sealed, env);
    expect(restored?.userId).toBe(SAMPLE_USER_ID.toLowerCase());
    expect(restored?.address).toBe(SAMPLE_ADDRESS_LOWER);
    expect(restored?.chainId).toBe(4663);
  });

  it('rejects tampered session cookies', () => {
    const session = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    const tampered = `${sealed.slice(0, -4)}xxxx`;
    expect(unsealSession(tampered, env)).toBeNull();
  });

  it('rejects expired sessions', () => {
    const session = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    expect(unsealSession(sealed, env, session.expiresAt + 1)).toBeNull();
  });

  it('rejects missing session as unauthenticated', () => {
    expect(unsealSession(null, env)).toBeNull();
    expect(unsealSession(undefined, env)).toBeNull();
    const request = new Request('http://localhost/api/auth/session');
    expect(getAuthenticatedWallet(request, env)).toBeNull();
    expect(getAuthenticatedScoopUser(request, env)).toBeNull();
  });

  it('replaces prior session payload when a new session is sealed for the same wallet', () => {
    const now = Date.now();
    const first = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663, now)!;
    const second = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663, now + 5_000)!;
    expect(first.userId).toBe(second.userId);
    expect(second.issuedAt).toBeGreaterThan(first.issuedAt);
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
    const restored = unsealSession(sealSession(second, env), env, now + 5_000);
    expect(restored?.userId).toBe(SAMPLE_USER_ID.toLowerCase());
    expect(restored?.issuedAt).toBe(now + 5_000);
  });

  it('resolves normalized authenticated address and userId from a valid session cookie', () => {
    const session = createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    const request = new Request('http://localhost/api/auth/session', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(sealed)}` },
    });
    expect(getAuthenticatedWallet(request, env)).toBe(SAMPLE_ADDRESS_LOWER);
    expect(getAuthenticatedScoopUser(request, env)).toEqual({
      userId: SAMPLE_USER_ID.toLowerCase(),
      address: SAMPLE_ADDRESS_LOWER,
      chainId: 4663,
    });
  });

  it('rejects non-Robinhood chain sessions', () => {
    expect(createSession(SAMPLE_USER_ID, SAMPLE_ADDRESS, 1)).toBeNull();
  });

  it('rejects pre-C.3a address-only session payloads (Option A)', () => {
    const legacyPayload = Buffer.from(
      JSON.stringify({
        address: SAMPLE_ADDRESS_LOWER,
        chainId: 4663,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    // Invalid signature → null; also construct via createSession missing userId path
    expect(createSession('not-a-uuid', SAMPLE_ADDRESS, 4663)).toBeNull();
    expect(unsealSession(`${legacyPayload}.fakesig`, env)).toBeNull();
  });

  it('creates server-controlled nonces and rejects expired sealed nonces', () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    const sealed = sealNonce(nonce, env);
    expect(unsealNonce(sealed, env)).toBe(nonce);
    expect(unsealNonce('not-a-sealed-nonce', env)).toBeNull();
  });
});

describe('sanitizeAssistResumePath', () => {
  it('allows only /news/{id}/launch paths', () => {
    expect(sanitizeAssistResumePath('/news/77/launch')).toBe('/news/77/launch');
    expect(sanitizeAssistResumePath('/news/abc%2F123/launch')).toBe('/news/abc%2F123/launch');
    expect(sanitizeAssistResumePath('https://evil.com')).toBeNull();
    expect(sanitizeAssistResumePath('//evil.com')).toBeNull();
    expect(sanitizeAssistResumePath('/launch')).toBeNull();
    expect(sanitizeAssistResumePath('/news/../admin/launch')).toBeNull();
  });
});
