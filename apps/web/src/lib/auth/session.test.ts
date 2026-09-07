import { describe, expect, it } from 'vitest';
import {
  createNonce,
  createSession,
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

describe('auth session cookies', () => {
  it('seals and unseals a session', () => {
    const session = createSession(SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    const restored = unsealSession(sealed, env);
    expect(restored?.address).toBe(SAMPLE_ADDRESS_LOWER);
    expect(restored?.chainId).toBe(4663);
  });

  it('rejects tampered session cookies', () => {
    const session = createSession(SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    const tampered = `${sealed.slice(0, -4)}xxxx`;
    expect(unsealSession(tampered, env)).toBeNull();
  });

  it('rejects expired sessions', () => {
    const session = createSession(SAMPLE_ADDRESS, 4663)!;
    const sealed = sealSession(session, env);
    expect(unsealSession(sealed, env, session.expiresAt + 1)).toBeNull();
  });

  it('consumes nonce with expiry', () => {
    const nonce = createNonce();
    const sealed = sealNonce(nonce, env);
    expect(unsealNonce(sealed, env)).toBe(nonce);
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
