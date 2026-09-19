/**
 * Six-calendar-month unlock policy (TGE / HoodLock).
 * Mirrored from scripts/lib/tge-unlock-policy.mjs — do not change semantics.
 */

export const DEV_BUY_LOCK_CALENDAR_MONTHS = 6 as const;
export const UNLOCK_SAFETY_MARGIN_SECONDS = 300 as const;

export function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Add N calendar months to a Unix timestamp (UTC wall-clock fields).
 * Preserves hour/minute/second/ms. Clamps day to last day of target month.
 */
export function addCalendarMonthsUtc(unixSeconds: number, months: number): number {
  if (!Number.isFinite(unixSeconds) || !Number.isInteger(months)) {
    throw new Error('addCalendarMonthsUtc: invalid inputs');
  }
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const min = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  const totalMonths = y * 12 + m + months;
  const targetY = Math.floor(totalMonths / 12);
  const targetM = ((totalMonths % 12) + 12) % 12;
  const dim = daysInUtcMonth(targetY, targetM);
  const targetDay = Math.min(day, dim);

  return Math.floor(Date.UTC(targetY, targetM, targetDay, h, min, s, ms) / 1000);
}

export function minimumUnlockUnixFromReference(
  referenceUnixSeconds: number,
  policyMonths: number = DEV_BUY_LOCK_CALENDAR_MONTHS,
): number {
  return addCalendarMonthsUtc(referenceUnixSeconds, policyMonths);
}

/** Proposed unlock for construction: policy months + safety margin. */
export function proposeSixMonthUnlock(args: {
  chainTimestampUnix: number;
  safetyMarginSeconds?: number;
  policyMonths?: number;
}): number {
  const margin =
    args.safetyMarginSeconds === undefined
      ? UNLOCK_SAFETY_MARGIN_SECONDS
      : args.safetyMarginSeconds;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new Error('proposeSixMonthUnlock: invalid safetyMarginSeconds');
  }
  const months = args.policyMonths ?? DEV_BUY_LOCK_CALENDAR_MONTHS;
  return minimumUnlockUnixFromReference(args.chainTimestampUnix, months) + margin;
}

/** Post-receipt verification against lock block timestamp (no margin). */
export function verifySixMonthUnlock(args: {
  unlockTimeUnix: number;
  lockTimeReferenceUnix: number;
  policyMonths?: number;
}): {
  ok: boolean;
  minimumUnlockUnix: number;
  unlockTimeUnix: number;
  policyMonths: number;
  deficitSeconds: number;
} {
  const months = args.policyMonths ?? DEV_BUY_LOCK_CALENDAR_MONTHS;
  const min = minimumUnlockUnixFromReference(args.lockTimeReferenceUnix, months);
  return {
    ok: args.unlockTimeUnix >= min,
    minimumUnlockUnix: min,
    unlockTimeUnix: args.unlockTimeUnix,
    policyMonths: months,
    deficitSeconds: args.unlockTimeUnix >= min ? 0 : min - args.unlockTimeUnix,
  };
}

export function formatUnlockUtc(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
