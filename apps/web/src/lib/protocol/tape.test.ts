import { describe, expect, it } from 'vitest';
import { checksumTapeAddress } from '@/lib/protocol/tape';

describe('checksumTapeAddress', () => {
  it('returns null when unset', () => {
    expect(checksumTapeAddress(null)).toBeNull();
    expect(checksumTapeAddress(undefined)).toBeNull();
    expect(checksumTapeAddress('')).toBeNull();
  });

  it('returns null for invalid addresses', () => {
    expect(checksumTapeAddress('not-an-address')).toBeNull();
    expect(checksumTapeAddress('0x0')).toBeNull();
  });

  it('checksums a valid address', () => {
    expect(checksumTapeAddress('0x4b227d5e6199f42cea4e638875ff8c740757dd3c')).toBe(
      '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C',
    );
  });
});
