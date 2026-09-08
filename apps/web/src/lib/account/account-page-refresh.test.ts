import { describe, expect, it } from 'vitest';
import { shouldBlankAccountWhileRefreshing } from '@/lib/account/account-page-refresh';

describe('shouldBlankAccountWhileRefreshing', () => {
  it('blanks on first load and non-ready states', () => {
    expect(shouldBlankAccountWhileRefreshing('loading')).toBe(true);
    expect(shouldBlankAccountWhileRefreshing('signed_out')).toBe(true);
    expect(shouldBlankAccountWhileRefreshing('error')).toBe(true);
    expect(shouldBlankAccountWhileRefreshing('wallet_mismatch')).toBe(true);
  });

  it('keeps ready account mounted during soft wallet reconnect/disconnect refresh', () => {
    expect(shouldBlankAccountWhileRefreshing('ready')).toBe(false);
  });

  it('allows forced blank on full SCOOP sign-out', () => {
    expect(
      shouldBlankAccountWhileRefreshing('ready', { forceBlank: true }),
    ).toBe(true);
  });
});
