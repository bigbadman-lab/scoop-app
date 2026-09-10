/**
 * Canonical launch-fee units from scoop-protocol ScoopFeeMath / ScoopFactory.
 * Uniswap v4 hundredths-of-a-bip: 1_000_000 = 100%.
 * BASE_FEE 10_000 = 1%. ADDITIONAL_FEE_STEP 1_000 = 0.1%.
 */

export const BASE_FEE = 10_000 as const;
/** @deprecated Prefer BASE_FEE — LP_FEE is an alias for the 1% base slice. */
export const LP_FEE = BASE_FEE;
export const ADDITIONAL_FEE_STEP = 1_000 as const;
export const MAX_ADDITIONAL_FEE = 20_000 as const;
export const MAX_TOTAL_FEE = 30_000 as const;

/** Canonical Uniswap v4 tick spacing for SCOOP pools. */
export const TICK_SPACING = 10 as const;

/**
 * Convert Uniswap v4 fee units to a percent number (e.g. 10_000 → 1).
 * Exact rational: feeUnits / 10_000.
 */
export function feeUnitsToPercent(feeUnits: number): number {
  if (!Number.isInteger(feeUnits) || feeUnits < 0) {
    throw new Error(`Invalid fee units: ${feeUnits}`);
  }
  return feeUnits / 10_000;
}

/** Percent → fee units (exact for tenths of a percent that match ADDITIONAL_FEE_STEP). */
export function percentToFeeUnits(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error(`Invalid percent: ${percent}`);
  }
  const units = percent * 10_000;
  if (!Number.isInteger(units)) {
    throw new Error(`Percent ${percent} is not an exact fee-unit multiple`);
  }
  return units;
}

export function assertValidAdditionalFee(additionalFee: number): void {
  if (!Number.isInteger(additionalFee)) {
    throw new Error(`additionalFee must be an integer: ${additionalFee}`);
  }
  if (additionalFee < 0 || additionalFee > MAX_ADDITIONAL_FEE) {
    throw new Error(
      `additionalFee ${additionalFee} outside [0, ${MAX_ADDITIONAL_FEE}]`,
    );
  }
  if (additionalFee % ADDITIONAL_FEE_STEP !== 0) {
    throw new Error(
      `additionalFee ${additionalFee} must be a multiple of ${ADDITIONAL_FEE_STEP}`,
    );
  }
}

export function totalPoolFee(additionalFee: number): number {
  assertValidAdditionalFee(additionalFee);
  const total = BASE_FEE + additionalFee;
  if (total > MAX_TOTAL_FEE) {
    throw new Error(`total pool fee ${total} exceeds MAX_TOTAL_FEE`);
  }
  return total;
}
