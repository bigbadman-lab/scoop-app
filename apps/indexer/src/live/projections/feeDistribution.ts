/**
 * Re-export shared fee-distribution normalization for indexer projections.
 * Canonical implementation lives in @scoop/shared.
 */
export {
  normalizeFeeDistributionArgs,
  isCanonicalDistributionArgs,
  assertDistributionConservation,
  distributionConserves,
  type NormalizedFeeDistributionLegs,
} from '@scoop/shared';
