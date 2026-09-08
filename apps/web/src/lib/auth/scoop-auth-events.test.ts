/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCOOP_AUTH_CHANGED_EVENT,
  notifyScoopAuthChanged,
  publishScoopProfileUpdate,
  signOutScoopSession,
  subscribeScoopAuthChanged,
} from '@/lib/auth/scoop-auth-events';

describe('scoop-auth-events', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('subscribeScoopAuthChanged receives notifyScoopAuthChanged detail', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeScoopAuthChanged(handler);
    notifyScoopAuthChanged({ reason: 'signin' });
    expect(handler).toHaveBeenCalledWith({ reason: 'signin' });
    unsubscribe();
    notifyScoopAuthChanged({ reason: 'refresh' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('signOutScoopSession broadcasts signout before and after fetch settles', async () => {
    let resolveFetch!: (value: { ok: boolean }) => void;
    const fetchPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise));

    const handler = vi.fn();
    const unsubscribe = subscribeScoopAuthChanged(handler);

    const pending = signOutScoopSession();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ reason: 'signout' });

    resolveFetch({ ok: true });
    await expect(pending).resolves.toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith({ reason: 'signout' });
    unsubscribe();
  });

  it('dispatches CustomEvent with scoop:auth-changed type', () => {
    const listener = vi.fn();
    window.addEventListener(SCOOP_AUTH_CHANGED_EVENT, listener);
    notifyScoopAuthChanged({ reason: 'profile' });
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(SCOOP_AUTH_CHANGED_EVENT);
    expect(event.detail).toEqual({ reason: 'profile' });
    window.removeEventListener(SCOOP_AUTH_CHANGED_EVENT, listener);
  });

  it('publishScoopProfileUpdate busts avatar URL and notifies subscribers', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeScoopAuthChanged(handler);
    publishScoopProfileUpdate(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        displayName: 'Desk Lead',
        avatarUrl: 'https://signed.example/avatar.png?token=abc',
      },
      1700000000000,
    );
    expect(handler).toHaveBeenCalledWith({
      reason: 'profile',
      profile: {
        userId: '11111111-1111-1111-1111-111111111111',
        displayName: 'Desk Lead',
        avatarUrl: 'https://signed.example/avatar.png?token=abc&v=1700000000000',
      },
    });
    unsubscribe();
  });
});
