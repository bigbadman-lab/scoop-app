import { describe, expect, it } from 'vitest';
import {
  DEV_BUY_LOCK_CALENDAR_MONTHS,
  LOCK_24H_SECONDS,
  LOCK_7D_SECONDS,
  UNLOCK_SAFETY_MARGIN_SECONDS,
  addCalendarMonthsUtc,
  proposeDurationUnlock,
  proposeSixMonthUnlock,
  verifyDurationUnlock,
  verifySixMonthUnlock,
} from './unlockPolicy.js';

describe('unlockPolicy (6 calendar months)', () => {
  it('exports 6 months and 300s margin', () => {
    expect(DEV_BUY_LOCK_CALENDAR_MONTHS).toBe(6);
    expect(UNLOCK_SAFETY_MARGIN_SECONDS).toBe(300);
  });

  it('Jan 31 → Jul 31', () => {
    const jan31 = Date.UTC(2025, 0, 31, 12, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(jan31, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(6); // July
    expect(d.getUTCDate()).toBe(31);
  });

  it('Aug 31 + 6 months clamps to Feb 28/29', () => {
    const aug31 = Date.UTC(2026, 7, 31, 15, 30, 0) / 1000;
    const end = addCalendarMonthsUtc(aug31, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(1); // February
    expect(d.getUTCDate()).toBe(28);
  });

  it('leap-year Feb 29 → Aug 29', () => {
    const feb29 = Date.UTC(2024, 1, 29, 8, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(feb29, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(29);
  });

  it('proposeSixMonthUnlock adds safety margin', () => {
    const t0 = 1_700_000_000;
    const proposed = proposeSixMonthUnlock({ chainTimestampUnix: t0 });
    const min = addCalendarMonthsUtc(t0, 6);
    expect(proposed).toBe(min + 300);
  });

  it('verifySixMonthUnlock accepts exact threshold', () => {
    const lockTs = 1_700_000_000;
    const unlock = addCalendarMonthsUtc(lockTs, 6);
    const r = verifySixMonthUnlock({
      unlockTimeUnix: unlock,
      lockTimeReferenceUnix: lockTs,
    });
    expect(r.ok).toBe(true);
    expect(r.deficitSeconds).toBe(0);
  });

  it('verifySixMonthUnlock rejects too-short unlock', () => {
    const lockTs = 1_700_000_000;
    const unlock = addCalendarMonthsUtc(lockTs, 6) - 1;
    const r = verifySixMonthUnlock({
      unlockTimeUnix: unlock,
      lockTimeReferenceUnix: lockTs,
    });
    expect(r.ok).toBe(false);
    expect(r.deficitSeconds).toBe(1);
  });
});

describe('unlockPolicy durations', () => {
  const t0 = Date.UTC(2026, 0, 31, 12, 0, 0) / 1000;

  it('24h proposal is exact duration plus safety margin', () => {
    expect(proposeDurationUnlock({
      chainTimestampUnix: t0,
      durationSeconds: LOCK_24H_SECONDS,
    })).toBe(t0 + LOCK_24H_SECONDS + UNLOCK_SAFETY_MARGIN_SECONDS);
  });

  it('7d verification uses the lock timestamp, not the margin', () => {
    const unlock = t0 + LOCK_7D_SECONDS;
    expect(verifyDurationUnlock({
      unlockTimeUnix: unlock,
      lockTimeReferenceUnix: t0,
      durationSeconds: LOCK_7D_SECONDS,
    }).ok).toBe(true);
    expect(verifyDurationUnlock({
      unlockTimeUnix: unlock - 1,
      lockTimeReferenceUnix: t0,
      durationSeconds: LOCK_7D_SECONDS,
    }).ok).toBe(false);
  });

  it('3 calendar months clamps Jan 31 to Apr 30', () => {
    const end = addCalendarMonthsUtc(t0, 3);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3);
    expect(d.getUTCDate()).toBe(30);
    const proposed = proposeSixMonthUnlock({
      chainTimestampUnix: t0,
      policyMonths: 3,
    });
    expect(proposed).toBe(end + UNLOCK_SAFETY_MARGIN_SECONDS);
    expect(verifySixMonthUnlock({
      unlockTimeUnix: end,
      lockTimeReferenceUnix: t0,
      policyMonths: 3,
    }).ok).toBe(true);
    expect(verifySixMonthUnlock({
      unlockTimeUnix: end - 1,
      lockTimeReferenceUnix: t0,
      policyMonths: 3,
    }).ok).toBe(false);
  });

  it('Aug 31 + 3 months clamps to Nov 30', () => {
    const aug31 = Date.UTC(2026, 7, 31, 8, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(aug31, 3);
    const d = new Date(end * 1000);
    expect(d.getUTCMonth()).toBe(10);
    expect(d.getUTCDate()).toBe(30);
  });
});
