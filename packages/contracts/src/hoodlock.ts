/**
 * HoodLock (RobinhoodLocker) on Robinhood Chain — Gate 2 / Gate 5 locked inputs.
 */
import type { HexAddress } from './manifest.js';

export const HOODLOCK_CHAIN_ID = 4663 as const;

/** Canonical RobinhoodLocker address (checksummed as deployed). */
export const HOODLOCK_LOCKER_ADDRESS =
  '0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F' as HexAddress;

export const HOODLOCK_LOCKER_ADDRESS_LOWER =
  HOODLOCK_LOCKER_ADDRESS.toLowerCase() as HexAddress;
