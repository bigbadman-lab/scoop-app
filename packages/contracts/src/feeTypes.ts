/**
 * Ordinals match scoop-protocol `ScoopFeeTypes.sol` declaration order.
 * Do not renumber without verifying Solidity source.
 */

/** ScoopFeeTypes.CreatorAllocationDestination */
export const CreatorAllocationDestination = {
  Creator: 0,
  Holders: 1,
} as const;

export type CreatorAllocationDestination =
  (typeof CreatorAllocationDestination)[keyof typeof CreatorAllocationDestination];

/** ScoopFeeTypes.AdditionalFeeDestination */
export const AdditionalFeeDestination = {
  Creator: 0,
  Deployer: 1,
  Holders: 2,
} as const;

export type AdditionalFeeDestination =
  (typeof AdditionalFeeDestination)[keyof typeof AdditionalFeeDestination];

export const CREATOR_ALLOCATION_DESTINATION_LABELS = {
  [CreatorAllocationDestination.Creator]: 'Creator',
  [CreatorAllocationDestination.Holders]: 'Holders',
} as const;

export const ADDITIONAL_FEE_DESTINATION_LABELS = {
  [AdditionalFeeDestination.Creator]: 'Creator',
  [AdditionalFeeDestination.Deployer]: 'Deployer',
  [AdditionalFeeDestination.Holders]: 'Holders',
} as const;
