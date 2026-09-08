/**
 * Cross-tree SCOOP auth notifications (shell ↔ account ↔ SIWE).
 * Keeps C.1c isolation: no React context requirement for wallet runtime.
 */

import { bustAvatarCacheUrl } from '@/lib/account/avatar';

export const SCOOP_AUTH_CHANGED_EVENT = 'scoop:auth-changed';

export type ScoopProfileSnapshot = {
  userId: string;
  displayName: string | null;
  avatarUrl: string;
};

export type ScoopAuthChangedDetail = {
  reason?: 'signout' | 'signin' | 'profile' | 'refresh';
  /** Canonical profile from a successful mutation (keyed by session userId). */
  profile?: ScoopProfileSnapshot;
};

export function notifyScoopAuthChanged(
  detail: ScoopAuthChangedDetail = { reason: 'refresh' },
): void {
  if (typeof window === 'undefined') return;
  if (typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent<ScoopAuthChangedDetail>(SCOOP_AUTH_CHANGED_EVENT, { detail }),
  );
}

export function subscribeScoopAuthChanged(
  handler: (detail: ScoopAuthChangedDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ScoopAuthChangedDetail>;
    handler(custom.detail ?? { reason: 'refresh' });
  };
  window.addEventListener(SCOOP_AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SCOOP_AUTH_CHANGED_EVENT, listener);
}

/**
 * Broadcast a successful profile mutation so shell chrome updates in-place.
 * Avatar URLs are cache-busted because storage paths are reused per user.
 */
export function publishScoopProfileUpdate(
  profile: ScoopProfileSnapshot,
  cacheVersion: string | number = Date.now(),
): void {
  notifyScoopAuthChanged({
    reason: 'profile',
    profile: {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: bustAvatarCacheUrl(profile.avatarUrl, cacheVersion),
    },
  });
}

/** Clear scoop_session and broadcast so shell chrome updates immediately. */
export async function signOutScoopSession(): Promise<boolean> {
  // Optimistic clear so chrome flips immediately.
  notifyScoopAuthChanged({ reason: 'signout' });
  try {
    const res = await fetch('/api/auth/signout', {
      method: 'POST',
      credentials: 'include',
    });
    // Confirm after the cookie is cleared so in-flight session reads cannot restore chrome.
    notifyScoopAuthChanged({ reason: 'signout' });
    return res.ok;
  } catch {
    notifyScoopAuthChanged({ reason: 'signout' });
    return false;
  }
}
