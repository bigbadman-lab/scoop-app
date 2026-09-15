import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

import {
  FRESH_LAUNCH_RETRY_LABEL,
  FRESH_LAUNCH_SYNCING_STATUS,
  FRESH_LAUNCH_UNKNOWN_COPY,
  freshLaunchSyncCopy,
  TokenFreshLaunchGate,
} from '@/components/token/TokenFreshLaunchGate';
import {
  INDEXED_LAUNCH_POLL_MS,
  INDEXED_LAUNCH_TIMEOUT_MS,
} from '@/lib/launch/wait-for-indexed-launch';
import { TOKEN_MARKET_LIVE_POLL_MS } from '@/lib/token/live-market';

describe('TokenFreshLaunchGate copy contracts', () => {
  it('exports the gate component', () => {
    expect(typeof TokenFreshLaunchGate).toBe('function');
  });

  it('uses Market loading… while syncing', () => {
    expect(freshLaunchSyncCopy(false)).toEqual({
      title: 'Market loading…',
      body: 'Your market has launched. Market data will appear shortly.',
    });
    expect(FRESH_LAUNCH_SYNCING_STATUS).toBe('Syncing market data…');
  });

  it('uses delayed-loading copy after timeout, with retry label', () => {
    expect(freshLaunchSyncCopy(true)).toEqual({
      title: 'Market data is taking longer than expected to load.',
      body: 'Your market has launched. Try checking again shortly.',
    });
    expect(FRESH_LAUNCH_RETRY_LABEL).toBe('Retry sync check');
  });

  it('keeps genuine unknown/no-market copy unchanged', () => {
    expect(FRESH_LAUNCH_UNKNOWN_COPY).toEqual({
      title: 'Market not found',
      body: 'No SCOOP market exists for this token address.',
    });
  });

  it('does not conflate empty trades with market-not-found', () => {
    const syncing = JSON.stringify(freshLaunchSyncCopy(false));
    const unknown = JSON.stringify(FRESH_LAUNCH_UNKNOWN_COPY);
    expect(syncing).not.toMatch(/No trades yet/i);
    expect(unknown).not.toMatch(/No trades yet/i);
  });
});

describe('indexed launch readiness constants', () => {
  it('uses 1000ms readiness poll shared by launch wait + token gate', () => {
    expect(INDEXED_LAUNCH_POLL_MS).toBe(1_000);
  });

  it('keeps overall readiness timeout at 90000ms', () => {
    expect(INDEXED_LAUNCH_TIMEOUT_MS).toBe(90_000);
  });

  it('leaves normal live-market polling at 2000ms', () => {
    expect(TOKEN_MARKET_LIVE_POLL_MS).toBe(2_000);
  });
});
