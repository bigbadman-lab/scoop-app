import { describe, expect, it } from 'vitest';
import {
  DEV_BUY_LOCK_CALENDAR_MONTHS,
  UNLOCK_SAFETY_MARGIN_SECONDS,
  addCalendarMonthsUtc,
  proposeSixMonthUnlock,
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
