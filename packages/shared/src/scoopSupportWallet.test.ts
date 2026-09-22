import { describe, expect, it } from 'vitest';
import {
  SCOOP_SUPPORT_WALLET,
  isScoopSupportWallet,
} from './scoopSupportWallet.js';

describe('scoopSupportWallet', () => {
  it('exposes the canonical public support wallet', () => {
    expect(SCOOP_SUPPORT_WALLET).toBe(
      '44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27',
    );
  });

  it('matches exact base58 only (no lowercasing)', () => {
    expect(isScoopSupportWallet(SCOOP_SUPPORT_WALLET)).toBe(true);
    expect(isScoopSupportWallet(` ${SCOOP_SUPPORT_WALLET} `)).toBe(true);
    expect(
      isScoopSupportWallet(SCOOP_SUPPORT_WALLET.toLowerCase()),
    ).toBe(false);
    expect(isScoopSupportWallet('So11111111111111111111111111111111111111112')).toBe(
      false,
    );
    expect(isScoopSupportWallet(null)).toBe(false);
    expect(isScoopSupportWallet(undefined)).toBe(false);
  });
});
