import { describe, expect, it } from 'vitest';
import { addressesEqual, normalizeAddress, sessionAddress } from '@/lib/auth/address';

const LOWER = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';
const MIXED_NON_EIP55 = '0x2e7A710bf18ebe437f6f2df867e346917e2b274c';
const CHECKSUM = '0x2e7A710BF18eBe437f6f2Df867E346917e2B274C';
const OTHER = '0x1111111111111111111111111111111111111111';

describe('address normalization', () => {
  it('treats lowercase, mixed non-EIP55, and checksum as the same wallet', () => {
    expect(sessionAddress(LOWER)).toBe(LOWER);
    expect(sessionAddress(MIXED_NON_EIP55)).toBe(LOWER);
    expect(sessionAddress(CHECKSUM)).toBe(LOWER);
    expect(normalizeAddress(MIXED_NON_EIP55)).toBe(CHECKSUM);
    expect(addressesEqual(LOWER, MIXED_NON_EIP55)).toBe(true);
    expect(addressesEqual(LOWER, CHECKSUM)).toBe(true);
    expect(addressesEqual(LOWER, OTHER)).toBe(false);
  });
});
