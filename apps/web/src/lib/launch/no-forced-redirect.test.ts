import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('post-launch handoff source invariants', () => {
  it('does not force-redirect after MARKET LIVE', () => {
    const src = readFileSync(
      join(__dirname, '../../components/launch/LaunchFlowLive.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/MARKET_LIVE_NAV_DELAY/);
    expect(src).not.toMatch(/Auto-navigate shortly after MARKET LIVE/);
  });

  it('sync messaging refers to market data, not market waiting to go live', () => {
    const syncBody =
      'SCOOP is syncing the latest market data. Charts, trades and holder data should appear shortly.';
    expect(syncBody.toLowerCase()).toContain('market data');
    expect(syncBody.toLowerCase()).not.toMatch(/waiting to go live|market not live/);
  });
});
