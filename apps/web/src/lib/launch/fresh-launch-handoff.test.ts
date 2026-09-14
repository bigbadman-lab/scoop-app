import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFreshLaunchHandoff,
  hasFreshLaunchEvidence,
  loadFreshLaunchHandoff,
  saveFreshLaunchHandoff,
} from '@/lib/launch/fresh-launch-handoff';

const TOKEN = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373' as const;
const OTHER = '0x1111111111111111111111111111111111111111' as const;

describe('fresh-launch-handoff', () => {
  beforeEach(() => {
    clearFreshLaunchHandoff();
  });

  it('stores and loads handoff for matching token', () => {
    saveFreshLaunchHandoff({
      chainId: 4663,
      tokenAddress: TOKEN,
      txHash: '0xabc',
      name: 'Hello',
      symbol: 'HELLO',
      quoteAsset: '0x0000000000000000000000000000000000000000',
    });
    const loaded = loadFreshLaunchHandoff(TOKEN.toUpperCase());
    expect(loaded?.symbol).toBe('HELLO');
    expect(loaded?.name).toBe('Hello');
  });

  it('does not match a different address', () => {
    saveFreshLaunchHandoff({
      chainId: 4663,
      tokenAddress: TOKEN,
      txHash: '0xabc',
      name: 'Hello',
      symbol: 'HELLO',
      quoteAsset: '0x0000000000000000000000000000000000000000',
    });
    expect(loadFreshLaunchHandoff(OTHER)).toBeNull();
  });

  it('exposes hasFreshLaunchEvidence for token-page gate decisions', () => {
    expect(hasFreshLaunchEvidence(TOKEN)).toBe(false);
    saveFreshLaunchHandoff({
      chainId: 4663,
      tokenAddress: TOKEN,
      txHash: '0xabc',
      name: 'Hello',
      symbol: 'HELLO',
      quoteAsset: '0x0000000000000000000000000000000000000000',
    });
    expect(hasFreshLaunchEvidence(TOKEN)).toBe(true);
    expect(hasFreshLaunchEvidence(OTHER)).toBe(false);
  });
});
