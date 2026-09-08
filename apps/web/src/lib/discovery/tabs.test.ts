import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVER_TAB,
  DISCOVER_TABS,
  getDiscoverTab,
} from '@/lib/discovery/tabs';
import { SCOOP_ORANGE, SCOOP_MARK_SRC } from '@/lib/brand';

describe('discover tabs', () => {
  it('defaults to NEW; Trending stays deferred without inventing ranking', () => {
    expect(DEFAULT_DISCOVER_TAB).toBe('new');
    const trending = getDiscoverTab('trending');
    expect(trending.dataAvailable).toBe(false);
    expect(trending.emptyMessage).toMatch(/not available/i);
  });

  it('maps New / Bonding / Bonded onto real discovery filters', () => {
    expect(getDiscoverTab('new').filter).toBe('new');
    expect(getDiscoverTab('bonding').filter).toBe('soon');
    expect(getDiscoverTab('bonded').filter).toBe('bonded');
    expect(DISCOVER_TABS).toHaveLength(4);
  });
});

describe('brand lock', () => {
  it('uses locked SCOOP orange and master mark path', () => {
    expect(SCOOP_ORANGE.toUpperCase()).toBe('#FC4C00');
    expect(SCOOP_MARK_SRC).toBe('/brand/MARK.png');
  });
});
