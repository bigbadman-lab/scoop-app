/**
 * Pure Factory LaunchParams builder — no broadcast.
 * Maps validated app state + resolved creator → ScoopFactory.LaunchParams.
 */
import { isAddress, type Address, type Hex } from 'viem';
import {
  AdditionalFeeDestination,
  CreatorAllocationDestination,
  totalPoolFee,
  validateAdditionalFeeUnits,
} from '@scoop/shared';
import {
  isCreatorResolved,
  resolveCreatorRecipient,
  type ResolvedCreatorRecipient,
} from '@/lib/launch/creator-recipient';
import { isZeroCreatorId } from '@/lib/launch/creator-id';
import {
  validateProtocolMetadata,
  type ProtocolMetadataInput,
} from '@/lib/launch/protocol-metadata';
import { isValidLaunchSalt } from '@/lib/launch/salt';
import { META_LIMITS, type LaunchFormState } from '@/lib/launch/types';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

/** Matches ScoopFactory.LaunchMetadata ABI tuple order. */
export type FactoryLaunchMetadata = {
  description: string;
  imageUri: string;
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
};

/** Matches canonical ScoopFactory.LaunchParams ABI tuple order. */
export type FactoryLaunchParams = {
  name: string;
  symbol: string;
  creatorId: Hex;
  quoteAsset: Address;
  metadata: FactoryLaunchMetadata;
  salt: Hex;
  additionalFee: number;
  creatorAllocationDestination: number;
  additionalFeeDestination: number;
};

export type LaunchParamsBuildInput = {
  state: LaunchFormState;
  /** Live wagmi account — required for connected creator mode. */
  liveConnectedAddress: string | null | undefined;
  /**
   * Override image URI (e.g. freshly pinned). Defaults to state.image.ipfsUri.
   */
  imageUri?: string | null;
  /** Expected chain — defaults to Robinhood 4663. */
  chainId?: number;
};

export type LaunchParamsBuildSuccess = {
  ok: true;
  params: FactoryLaunchParams;
  creator: Extract<ResolvedCreatorRecipient, { type: 'wallet' | 'x' }>;
  /** News provenance — not in calldata; preserved for V2.C activation. */
  provenance: {
    sourceProvider: string | null;
    sourceProviderArticleId: string | null;
    sourceDraftId: string | null;
  };
  /** Derived total pool fee (BASE + additional) for logging/review. */
  totalPoolFee: number;
};

export type LaunchParamsBuildFailure = {
  ok: false;
  errors: Record<string, string>;
};

export type LaunchParamsBuildResult =
  | LaunchParamsBuildSuccess
  | LaunchParamsBuildFailure;

function fail(errors: Record<string, string>): LaunchParamsBuildFailure {
  return { ok: false, errors };
}

/**
 * Canonical quote address from Market step selection.
 * ETH is the zero address per ScoopFactory / QuoteRegistry semantics.
 * Never infer from display symbol alone — state.quoteAsset is authoritative.
 */
export function resolveQuoteAssetAddress(
  quoteAsset: string | null,
): Address | null {
  if (!quoteAsset) return null;
  if (!isAddress(quoteAsset, { strict: false })) return null;
  return quoteAsset.toLowerCase() as Address;
}

export function buildLaunchParams(
  input: LaunchParamsBuildInput,
): LaunchParamsBuildResult {
  const errors: Record<string, string> = {};
  const chainId = input.chainId ?? ROBINHOOD_CHAIN_ID;
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    errors.chainId = `Launch requires chain ${ROBINHOOD_CHAIN_ID}.`;
  }

  const name = input.state.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > META_LIMITS.nameMax) {
    errors.name = `Name must be ${META_LIMITS.nameMax} characters or fewer.`;
  }

  const symbol = input.state.ticker.trim().toUpperCase();
  if (!symbol) errors.ticker = 'Ticker is required.';
  else if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    errors.ticker = 'Ticker must be 2–10 characters (A–Z, 0–9).';
  }

  const creator = resolveCreatorRecipient(
    input.state,
    input.liveConnectedAddress,
  );
  if (!isCreatorResolved(creator)) {
    errors.creator = creator.reason;
  } else if (isZeroCreatorId(creator.creatorId)) {
    errors.creator = 'creatorId must not be zero.';
  }

  const quoteAsset = resolveQuoteAssetAddress(input.state.quoteAsset);
  if (quoteAsset === null) {
    errors.quoteAsset = input.state.quoteAsset
      ? 'Quote asset address is invalid.'
      : 'Select a quote asset.';
  }

  if (!isValidLaunchSalt(input.state.salt)) {
    errors.salt = 'Launch salt must be a 32-byte hex value.';
  }

  const feeCheck = validateAdditionalFeeUnits(input.state.additionalFee);
  if (!feeCheck.ok) {
    errors.additionalFee = feeCheck.message;
  }

  const creatorAlloc = input.state.creatorAllocationDestination;
  if (
    creatorAlloc !== CreatorAllocationDestination.Creator &&
    creatorAlloc !== CreatorAllocationDestination.Holders
  ) {
    errors.creatorAllocationDestination =
      'Choose whether the base creator allocation goes to the Creator or Holders.';
  }

  const additionalDest = input.state.additionalFeeDestination;
  if (
    additionalDest !== AdditionalFeeDestination.Creator &&
    additionalDest !== AdditionalFeeDestination.Deployer &&
    additionalDest !== AdditionalFeeDestination.Holders
  ) {
    errors.additionalFeeDestination =
      'Choose where the additional fee should go.';
  }

  const imageUri = (
    input.imageUri ??
    input.state.image.ipfsUri ??
    ''
  ).trim();

  const metadataInput: ProtocolMetadataInput = {
    description: input.state.description.trim(),
    imageUri,
    twitter: input.state.twitter.trim(),
    telegram: input.state.telegram.trim(),
    discord: '',
    website: '',
    farcaster: '',
  };
  const metaErrors = validateProtocolMetadata(metadataInput);
  Object.assign(errors, metaErrors);

  if (Object.keys(errors).length > 0 || !isCreatorResolved(creator) || quoteAsset === null) {
    return fail(errors);
  }

  const additionalFee = feeCheck.ok ? feeCheck.additionalFee : 0;
  const params: FactoryLaunchParams = {
    name,
    symbol,
    creatorId: creator.creatorId,
    quoteAsset,
    metadata: {
      description: metadataInput.description,
      imageUri,
      twitter: metadataInput.twitter ?? '',
      telegram: metadataInput.telegram ?? '',
      discord: '',
      website: '',
      farcaster: '',
    },
    salt: input.state.salt,
    additionalFee,
    creatorAllocationDestination: creatorAlloc,
    additionalFeeDestination: additionalDest,
  };

  return {
    ok: true,
    params,
    creator,
    provenance: {
      sourceProvider: input.state.sourceProvider,
      sourceProviderArticleId: input.state.sourceProviderArticleId,
      sourceDraftId: input.state.sourceDraftId,
    },
    totalPoolFee: totalPoolFee(additionalFee),
  };
}
