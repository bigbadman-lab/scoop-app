import { describe, expect, it } from 'vitest';
import { HOODLOCK_CHAIN_ID, HOODLOCK_LOCKER_ADDRESS } from './hoodlock.js';
import { hoodlockLockerAbi } from './hoodlockAbi.js';

describe('HoodLock contract definitions (Gate 5)', () => {
  it('locks Gate 2 address and chain', () => {
    expect(HOODLOCK_CHAIN_ID).toBe(4663);
    expect(HOODLOCK_LOCKER_ADDRESS.toLowerCase()).toBe(
      '0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f',
    );
  });

  it('ABI includes fee, lock, locks, indexes, Locked', () => {
    const names = hoodlockLockerAbi.map((x) => ('name' in x ? x.name : ''));
    expect(names).toContain('fee');
    expect(names).toContain('lock');
    expect(names).toContain('locks');
    expect(names).toContain('locksByOwner');
    expect(names).toContain('locksByToken');
    expect(names).toContain('Locked');
  });
});
