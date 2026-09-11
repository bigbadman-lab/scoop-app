import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVER_TAB,
  DISCOVER_LIVE_POLL_MS,
  DISCOVER_TABS,
  getDiscoverTab,
} from '@/lib/discovery/tabs';
import { SCOOP_ORANGE, SCOOP_MARK_SRC } from '@/lib/brand';

describe('discover tabs', () => {
  it('defaults to NEW; Trending is live with activity ranking', () => {
    expect(DEFAULT_DISCOVER_TAB).toBe('new');
    const trending = getDiscoverTab('trending');
    expect(trending.dataAvailable).toBe(true);
    expect(trending.emptyMessage).toMatch(/No trending markets yet/i);
    expect(DISCOVER_LIVE_POLL_MS).toBe(2000);
  });

  it('maps New onto discovery filter; Bonding is dedicated incomplete-launch (not soon)', () => {
    expect(getDiscoverTab('new').filter).toBe('new');
    expect(getDiscoverTab('bonding').filter).toBeUndefined();
    expect(getDiscoverTab('bonding').label).toBe('Bonding');
    expect(DISCOVER_TABS.some((tab) => tab.id === 'bonded')).toBe(false);
    expect(DISCOVER_TABS.map((tab) => tab.label)).not.toContain('Bonded');
    expect(DISCOVER_TABS).toHaveLength(3);
  });
});

describe('brand lock', () => {
  it('uses locked SCOOP orange and master mark path', () => {
    expect(SCOOP_ORANGE.toUpperCase()).toBe('#FC4C00');
    expect(SCOOP_MARK_SRC).toBe('/brand/MARK.png');
  });
});
