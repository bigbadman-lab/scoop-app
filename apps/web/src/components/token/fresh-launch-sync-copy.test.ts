import { describe, expect, it } from 'vitest';
import {
  FRESH_LAUNCH_RETRY_LABEL,
  FRESH_LAUNCH_UNKNOWN_COPY,
  freshLaunchSyncCopy,
} from '@/components/token/TokenFreshLaunchGate';
import {
  INDEXED_LAUNCH_POLL_MS,
  INDEXED_LAUNCH_TIMEOUT_MS,
} from '@/lib/launch/wait-for-indexed-launch';
import { TOKEN_MARKET_LIVE_POLL_MS } from '@/lib/token/live-market';

describe('freshLaunchSyncCopy', () => {
  it('returns loading copy while syncing', () => {
    expect(freshLaunchSyncCopy(false)).toEqual({
      title: 'Market loading…',
      body: 'Your market has launched. Market data will appear shortly.',
    });
  });

  it('returns delayed-loading copy after timeout', () => {
    expect(freshLaunchSyncCopy(true)).toEqual({
      title: 'Market data is taking longer than expected to load.',
      body: 'Your market has launched. Try checking again shortly.',
    });
    expect(FRESH_LAUNCH_RETRY_LABEL).toBe('Retry sync check');
  });

  it('preserves genuine unknown market copy', () => {
    expect(FRESH_LAUNCH_UNKNOWN_COPY.title).toBe('Market not found');
    expect(FRESH_LAUNCH_UNKNOWN_COPY.body).toBe(
      'No SCOOP market exists for this token address.',
    );
  });
});

describe('indexed launch readiness constants', () => {
  it('uses 1000ms readiness poll, 90000ms timeout, and keeps live poll at 2000ms', () => {
    expect(INDEXED_LAUNCH_POLL_MS).toBe(1_000);
    expect(INDEXED_LAUNCH_TIMEOUT_MS).toBe(90_000);
    expect(TOKEN_MARKET_LIVE_POLL_MS).toBe(2_000);
  });
});
