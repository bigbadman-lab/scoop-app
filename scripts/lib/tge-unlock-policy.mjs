/**
 * TGE dev-buy unlock policy (UTC, deterministic calendar months).
 *
 * Canonical duration: TGE_DEV_BUY_LOCK_CALENDAR_MONTHS (6).
 *
 * Approach:
 * - Compute `addCalendarMonthsUtc(referenceUnix, policyMonths)` with end-of-month
 *   clamping (e.g. 2024-02-29 → 2024-08-29; 2026-08-31 → 2027-02-28).
 * - For *proposed* unlock before broadcast: use
 *   `addCalendarMonthsUtc(freshChainTimestamp, policyMonths) + SAFETY_MARGIN_SECONDS`
 *   so a slightly later mined lock timestamp still satisfies the policy.
 * - For *post-receipt* verification: require
 *   `recordedUnlockTime >= addCalendarMonthsUtc(lockBlockTimestamp, policyMonths)`
 *   (no margin required on the proof side — margin only protects the proposal).
 */
import {
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
  TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
} from './tge-constants.mjs';

/**
 * @param {number} year
 * @param {number} monthIndex0 0-11
 */
export function daysInUtcMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Add N calendar months to a Unix timestamp (UTC wall-clock fields).
 * Preserves hour/minute/second/ms. Clamps day to last day of target month.
 *
 * @param {number} unixSeconds
 * @param {number} months
 * @returns {number} unix seconds
 */
export function addCalendarMonthsUtc(unixSeconds, months) {
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

  return Math.floor(
    Date.UTC(targetY, targetM, targetDay, h, min, s, ms) / 1000,
  );
}

/**
 * Minimum unlock timestamp that satisfies >= policy calendar months from reference.
 * @param {number} referenceUnixSeconds lock-time reference (usually block.timestamp)
 * @param {number} [policyMonths=TGE_DEV_BUY_LOCK_CALENDAR_MONTHS]
 */
export function minimumUnlockUnixFromReference(
  referenceUnixSeconds,
  policyMonths = TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
) {
  return addCalendarMonthsUtc(referenceUnixSeconds, policyMonths);
}

/**
 * Proposed unlock for construction: policy months from chain time + safety margin.
 * @param {{
 *   chainTimestampUnix: number,
 *   safetyMarginSeconds?: number,
 *   policyMonths?: number,
 * }} args
 */
export function proposeUnlockUnix(args) {
  const margin =
    args.safetyMarginSeconds === undefined
      ? TGE_UNLOCK_SAFETY_MARGIN_SECONDS
      : args.safetyMarginSeconds;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new Error('proposeUnlockUnix: invalid safetyMarginSeconds');
  }
  const months = args.policyMonths ?? TGE_DEV_BUY_LOCK_CALENDAR_MONTHS;
  return minimumUnlockUnixFromReference(args.chainTimestampUnix, months) + margin;
}

/**
 * Post-receipt / existing-lock policy check against canonical TGE duration.
 * @param {{
 *   unlockTimeUnix: number,
 *   lockTimeReferenceUnix: number,
 *   policyMonths?: number,
 * }} args
 */
export function unlockSatisfiesDevBuyLockPolicy(args) {
  const months = args.policyMonths ?? TGE_DEV_BUY_LOCK_CALENDAR_MONTHS;
  const min = minimumUnlockUnixFromReference(args.lockTimeReferenceUnix, months);
  return {
    ok: args.unlockTimeUnix >= min,
    minimumUnlockUnix: min,
    unlockTimeUnix: args.unlockTimeUnix,
    policyMonths: months,
    deficitSeconds:
      args.unlockTimeUnix >= min ? 0 : min - args.unlockTimeUnix,
  };
}

/**
 * @param {number} unixSeconds
 */
export function formatUnlockUtc(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export { TGE_DEV_BUY_LOCK_CALENDAR_MONTHS };
