import { describe, expect, it } from 'vitest';
import {
  LOCK_24H_SECONDS,
  LOCK_7D_SECONDS,
  UNLOCK_SAFETY_MARGIN_SECONDS,
  addCalendarMonthsUtc,
} from '@scoop/shared';
import {
  DEFAULT_DEV_SUPPLY_POLICY,
  DEV_SUPPLY_BURN_ADDRESS,
  DEV_SUPPLY_OPTIONS,
  proposeUnlockUnix,
  resolveDevSupplyPolicy,
  unlockSatisfiesPolicy,
} from '@/lib/launch/dev-supply-policy';

describe('dev supply policy', () => {
  it('defaults missing and invalid values to the previous 6-month lock', () => {
    expect(DEFAULT_DEV_SUPPLY_POLICY).toBe('lock_6m');
    expect(resolveDevSupplyPolicy(undefined)).toBe('lock_6m');
    expect(resolveDevSupplyPolicy(null)).toBe('lock_6m');
    expect(resolveDevSupplyPolicy('lock_24h')).toBe('lock_24h');
  });

  it('exposes exactly five options with 6 Months last among locks', () => {
    expect(DEV_SUPPLY_OPTIONS.map((option) => option.label)).toEqual([
      '24 Hours',
      '7 Days',
      '3 Months',
      '6 Months',
      'Burn Dev Supply',
    ]);
    expect(DEV_SUPPLY_BURN_ADDRESS).toBe(
      '0x000000000000000000000000000000000000dEaD',
    );
  });

  it('proposes 24h and 7d as exact durations plus the existing safety margin', () => {
    const t0 = 1_700_000_000;
    expect(proposeUnlockUnix({ policy: 'lock_24h', chainTimestampUnix: t0 })).toBe(
      Math.floor(t0) + LOCK_24H_SECONDS + UNLOCK_SAFETY_MARGIN_SECONDS,
    );
    expect(proposeUnlockUnix({ policy: 'lock_7d', chainTimestampUnix: t0 })).toBe(
      Math.floor(t0) + LOCK_7D_SECONDS + UNLOCK_SAFETY_MARGIN_SECONDS,
    );
    expect(
      unlockSatisfiesPolicy({
        policy: 'lock_24h',
        lockTimeReferenceUnix: t0,
        unlockTimeUnix: t0 + LOCK_24H_SECONDS,
      }).ok,
    ).toBe(true);
    expect(
      unlockSatisfiesPolicy({
        policy: 'lock_24h',
        lockTimeReferenceUnix: t0,
        unlockTimeUnix: t0 + LOCK_24H_SECONDS - 1,
      }).ok,
    ).toBe(false);
  });

  it('uses calendar months, including month-end clamps, not 90 or 180 days', () => {
    const jan31 = Date.UTC(2026, 0, 31, 12, 0, 0) / 1000;
    const aug31 = Date.UTC(2026, 7, 31, 15, 30, 0) / 1000;
    expect(proposeUnlockUnix({ policy: 'lock_3m', chainTimestampUnix: jan31 })).toBe(
      addCalendarMonthsUtc(jan31, 3) + UNLOCK_SAFETY_MARGIN_SECONDS,
    );
    expect(new Date(addCalendarMonthsUtc(jan31, 3) * 1000).getUTCDate()).toBe(30);
    expect(new Date(addCalendarMonthsUtc(aug31, 3) * 1000).getUTCMonth()).toBe(10);
    expect(proposeUnlockUnix({ policy: 'lock_6m', chainTimestampUnix: jan31 })).toBe(
      addCalendarMonthsUtc(jan31, 6) + UNLOCK_SAFETY_MARGIN_SECONDS,
    );
    const six = unlockSatisfiesPolicy({
      policy: 'lock_6m',
      lockTimeReferenceUnix: jan31,
      unlockTimeUnix: addCalendarMonthsUtc(jan31, 6) - 1,
    });
    expect(six.ok).toBe(false);
    expect(six.message).toBe(
      'Onchain unlock time does not satisfy the 6-calendar-month policy.',
    );
  });
});
