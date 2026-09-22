/**
 * UTC calendar-month unlock math for official $TAPE Streamflow lock.
 * Same end-of-month clamping rules as RHC HoodLock policy (ported, Solana-facing).
 */

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

export function unlockUnixSixCalendarMonthsFrom(createdUnix: number): number {
  return addCalendarMonthsUtc(createdUnix, 6);
}
