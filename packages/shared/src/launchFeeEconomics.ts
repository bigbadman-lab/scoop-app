/**
 * Launch trading-fee economics for UI preview (rate configuration, not post-collection amounts).
 * Uses exact integer fee-unit arithmetic from @scoop/contracts.
 */
import {
  AdditionalFeeDestination,
  ADDITIONAL_FEE_STEP,
  assertValidAdditionalFee,
  BASE_FEE,
  CreatorAllocationDestination,
  feeUnitsToPercent,
  MAX_ADDITIONAL_FEE,
  totalPoolFee,
  type AdditionalFeeDestination as AdditionalFeeDestinationType,
  type CreatorAllocationDestination as CreatorAllocationDestinationType,
} from '@scoop/contracts';

/** Share of the base 1% fee pool (sum = 10_000). */
export const BASE_FEE_CREATOR_SHARE = 7_000 as const;
export const BASE_FEE_DEPLOYER_SHARE = 400 as const;
export const BASE_FEE_PROTOCOL_SHARE = 2_000 as const;
export const BASE_FEE_OPERATIONS_SHARE = 600 as const;

export type LaunchFeeEconomicsInput = {
  creatorAllocationDestination: CreatorAllocationDestinationType;
  additionalFee: number;
  additionalFeeDestination: AdditionalFeeDestinationType;
};

/** Effective trading-fee rate volumes in Uniswap v4 fee units (10_000 = 1%). */
export type EffectiveFeeRouting = {
  baseFeeUnits: number;
  additionalFeeUnits: number;
  totalFeeUnits: number;
  creatorUnits: number;
  holdersUnits: number;
  deployerUnits: number;
  protocolUnits: number;
  operationsUnits: number;
};

function baseSlice(shareOfBase: number): number {
  return (BASE_FEE * shareOfBase) / 10_000;
}

/**
 * Derive user-facing effective fee-rate volumes from immutable launch choices.
 * Does not model distributor basePart/extraPart rounding on collected amounts.
 */
export function computeEffectiveFeeRouting(
  input: LaunchFeeEconomicsInput,
): EffectiveFeeRouting {
  assertValidAdditionalFee(input.additionalFee);
  const totalFeeUnits = totalPoolFee(input.additionalFee);

  let creatorUnits = 0;
  let holdersUnits = 0;
  let deployerUnits = baseSlice(BASE_FEE_DEPLOYER_SHARE);
  const protocolUnits = baseSlice(BASE_FEE_PROTOCOL_SHARE);
  const operationsUnits = baseSlice(BASE_FEE_OPERATIONS_SHARE);
  const creatorBase = baseSlice(BASE_FEE_CREATOR_SHARE);

  if (input.creatorAllocationDestination === CreatorAllocationDestination.Holders) {
    holdersUnits += creatorBase;
  } else {
    creatorUnits += creatorBase;
  }

  if (input.additionalFee > 0) {
    switch (input.additionalFeeDestination) {
      case AdditionalFeeDestination.Creator:
        creatorUnits += input.additionalFee;
        break;
      case AdditionalFeeDestination.Deployer:
        deployerUnits += input.additionalFee;
        break;
      case AdditionalFeeDestination.Holders:
        holdersUnits += input.additionalFee;
        break;
      default: {
        const _exhaustive: never = input.additionalFeeDestination;
        throw new Error(`Unknown additionalFeeDestination: ${_exhaustive}`);
      }
    }
  }

  const sum =
    creatorUnits + holdersUnits + deployerUnits + protocolUnits + operationsUnits;
  if (sum !== totalFeeUnits) {
    throw new Error(
      `effective fee routing conservation failed: sum=${sum} total=${totalFeeUnits}`,
    );
  }

  return {
    baseFeeUnits: BASE_FEE,
    additionalFeeUnits: input.additionalFee,
    totalFeeUnits,
    creatorUnits,
    holdersUnits,
    deployerUnits,
    protocolUnits,
    operationsUnits,
  };
}

/** Display helper: 7000 units → "0.70%". */
export function formatTradingFeePercent(feeUnits: number): string {
  return `${feeUnitsToPercent(feeUnits).toFixed(2)}%`;
}

export type AdditionalFeeValidation =
  | { ok: true; additionalFee: number }
  | { ok: false; message: string };

/** Validate additional fee in protocol units. */
export function validateAdditionalFeeUnits(
  additionalFee: number,
): AdditionalFeeValidation {
  if (!Number.isInteger(additionalFee)) {
    return {
      ok: false,
      message: 'Additional fee must use 0.1% increments.',
    };
  }
  if (additionalFee < 0 || additionalFee > MAX_ADDITIONAL_FEE) {
    return {
      ok: false,
      message: 'Additional fee must be between 0% and 2%.',
    };
  }
  if (additionalFee % ADDITIONAL_FEE_STEP !== 0) {
    return {
      ok: false,
      message: 'Additional fee must use 0.1% increments.',
    };
  }
  return { ok: true, additionalFee };
}

/** Convert a display percent (0, 0.1, …, 2) to fee units. */
export function additionalFeePercentToUnits(
  percent: number,
): AdditionalFeeValidation {
  if (!Number.isFinite(percent) || percent < 0) {
    return { ok: false, message: 'Additional fee must be between 0% and 2%.' };
  }
  const unitsExact = percent * 10_000;
  if (!Number.isInteger(unitsExact)) {
    return { ok: false, message: 'Additional fee must use 0.1% increments.' };
  }
  return validateAdditionalFeeUnits(unitsExact);
}

export const ADDITIONAL_FEE_PRESETS = [
  { key: '0' as const, label: '0%', units: 0 },
  { key: '1' as const, label: '+1%', units: 10_000 },
  { key: '2' as const, label: '+2%', units: 20_000 },
] as const;

export type AdditionalFeePresetKey =
  | (typeof ADDITIONAL_FEE_PRESETS)[number]['key']
  | 'custom';

export function resolveAdditionalFeePreset(units: number): AdditionalFeePresetKey {
  if (units === 0) return '0';
  if (units === 10_000) return '1';
  if (units === 20_000) return '2';
  return 'custom';
}

export {
  CreatorAllocationDestination,
  AdditionalFeeDestination,
  BASE_FEE,
  ADDITIONAL_FEE_STEP,
  MAX_ADDITIONAL_FEE,
};
