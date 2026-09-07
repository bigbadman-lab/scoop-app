import { isNewsPublicDisplayEnabled } from '@scoop/news';

export type LaunchAssistAccess =
  | { ok: true; mode: 'development' }
  | { ok: false; code: 'AUTH_REQUIRED' | 'DISPLAY_GATED'; message: string };

/**
 * Product auth for paid concept generation.
 * No wallet/session product auth exists in apps/web yet (WalletSlot deferred).
 * Production must not expose OpenAI-backed generation anonymously.
 * Development allows generation so Phase A can be reviewed locally.
 */
export function resolveLaunchAssistAccess(
  env: NodeJS.ProcessEnv = process.env,
): LaunchAssistAccess {
  if (!isNewsPublicDisplayEnabled(env)) {
    return {
      ok: false,
      code: 'DISPLAY_GATED',
      message: 'News launch assist is not enabled yet.',
    };
  }

  if (env.NODE_ENV === 'development') {
    return { ok: true, mode: 'development' };
  }

  return {
    ok: false,
    code: 'AUTH_REQUIRED',
    message:
      'Launch assist requires product authentication (wallet/session), which is not available yet.',
  };
}
