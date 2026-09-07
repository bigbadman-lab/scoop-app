import { describe, expect, it } from 'vitest';
import { resolveLaunchAssistAccess } from '@/lib/launch-assist/access';

describe('resolveLaunchAssistAccess', () => {
  it('blocks when news public display is gated', () => {
    const result = resolveLaunchAssistAccess({
      SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'false',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({
      ok: false,
      code: 'DISPLAY_GATED',
      message: 'News launch assist is not enabled yet.',
    });
  });

  it('allows generation in development when display is enabled', () => {
    const result = resolveLaunchAssistAccess({
      SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({ ok: true, mode: 'development' });
  });

  it('requires auth in production (no wallet/session product auth yet)', () => {
    const result = resolveLaunchAssistAccess({
      SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED: 'true',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AUTH_REQUIRED');
    }
  });
});
