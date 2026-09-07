import { describe, expect, it } from 'vitest';
import { resolveLaunchAssistAccess } from '@/lib/launch-assist/access';
import type { ScoopAuthSession } from '@/lib/auth/session';

const session: ScoopAuthSession = {
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  chainId: 4663,
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

describe('resolveLaunchAssistAccess', () => {
  it('blocks when news public display is gated', () => {
    const result = resolveLaunchAssistAccess(
      {
        SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'false',
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv,
      session,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DISPLAY_GATED');
  });

  it('allows development without session when display is enabled', () => {
    const result = resolveLaunchAssistAccess({
      SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({ ok: true, mode: 'development', session: null });
  });

  it('requires auth in production without session', () => {
    const result = resolveLaunchAssistAccess({
      SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AUTH_REQUIRED');
  });

  it('allows production when a verified session is present', () => {
    const result = resolveLaunchAssistAccess(
      {
        SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv,
      session,
    );
    expect(result).toEqual({ ok: true, mode: 'session', session });
  });
});
