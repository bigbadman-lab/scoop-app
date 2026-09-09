import { isNewsPublicDisplayEnabled } from '@scoop/news';
import type { ScoopAuthSession } from '@/lib/auth/session';

export type LaunchAssistAccess =
  | { ok: true; mode: 'session' | 'development'; session: ScoopAuthSession | null }
  | { ok: false; code: 'AUTH_REQUIRED' | 'DISPLAY_GATED'; message: string };

/**
 * Centralized paid-AI access policy.
 * Production requires a server-verified SIWE session.
 * Development may bypass when no session exists (local review without Reown).
 * Never trust client-reported addresses.
 */
export function resolveLaunchAssistAccess(
  env: NodeJS.ProcessEnv = process.env,
  session: ScoopAuthSession | null = null,
): LaunchAssistAccess {
  if (!isNewsPublicDisplayEnabled(env)) {
    return {
      ok: false,
      code: 'DISPLAY_GATED',
      message: 'News launch assist is not enabled yet.',
    };
  }

  if (session) {
    return { ok: true, mode: 'session', session };
  }

  if (env.NODE_ENV === 'development') {
    return { ok: true, mode: 'development', session: null };
  }

  return {
    ok: false,
    code: 'AUTH_REQUIRED',
    message: 'Sign in with your wallet to use launch assist.',
  };
}

/** Rate-limit key: authenticated address when present, else IP-only bucket. */
export function launchAssistRateKey(
  kind: 'concepts' | 'artwork' | 'select' | 'artwork-retry',
  ip: string,
  session: ScoopAuthSession | null,
): string {
  const identity = session?.address ?? 'anon';
  return `launch-assist-${kind}:${identity}:${ip}`;
}
