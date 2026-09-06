import { describe, expect, it } from 'vitest';
import {
  HELLO_FIXTURE,
  NATIVE_ETH_ADDRESS,
  SCOOP_CHAIN_ID,
  ZERO_ADDRESS,
  normalizeAddress,
} from './index.js';

describe('@scoop/shared', () => {
  it('exposes chain ID 4663', () => {
    expect(SCOOP_CHAIN_ID).toBe(4663);
  });

  it('exposes native ETH / zero address', () => {
    expect(NATIVE_ETH_ADDRESS).toBe('0x0000000000000000000000000000000000000000');
    expect(ZERO_ADDRESS).toBe(NATIVE_ETH_ADDRESS);
  });

  it('normalizes addresses', () => {
    expect(normalizeAddress('0x2284ed0e4d446c6D78aC2d49a68BAE822Fd87373')).toBe(
      '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
  });

  it('re-exports HELLO fixture constants', () => {
    expect(HELLO_FIXTURE.token).toBe('0x2284ed0e4d446c6D78aC2d49a68BAE822Fd87373');
    expect(HELLO_FIXTURE.launchBlock).toBe(55863290);
  });
});
