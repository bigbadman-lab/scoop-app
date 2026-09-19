import type { Hex } from 'viem';
import { generateLaunchSalt, isValidLaunchSalt } from '@/lib/launch/salt';
import { PonsAdapterError } from './errors';

/** 32-byte cryptographically random salt for Pons CREATE2 launches. */
export function generatePonsSalt(randomBytes?: Uint8Array): Hex {
  return generateLaunchSalt(randomBytes);
}

export function isValidPonsSalt(value: string): value is Hex {
  return isValidLaunchSalt(value);
}

/**
 * Resolve salt for a launch draft.
 * - If `existing` is provided and valid, it is preserved (retries must reuse it).
 * - Otherwise generate a fresh salt.
 * Never silently replaces a caller-supplied salt.
 */
export function resolvePonsSalt(existing?: Hex | string | null): Hex {
  if (existing != null && existing !== '') {
    if (!isValidPonsSalt(existing)) {
      throw new PonsAdapterError('INVALID_INPUT', 'Pons salt must be a 32-byte hex value.');
    }
    return existing as Hex;
  }
  return generatePonsSalt();
}
