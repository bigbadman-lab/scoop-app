import { getAddress, type Hex } from 'viem';
import {
  PONS_LAUNCH_CONFIG_ID,
  PONS_NATIVE_PAIR_TOKEN,
  PONS_V2_CHAIN_ID,
  PONS_V2_LAUNCH_AND_BUY,
} from './constants';
import { ponsLaunchAndBuyWriteAbi } from './abi';
import { PonsAdapterError } from './errors';
import { resolvePonsSalt } from './salt';
import type {
  PonsLaunchAdapterInput,
  PonsLaunchAndBuyRequest,
  PonsPreflightResult,
  PonsTokenParams,
} from './types';

function str(v: string | undefined | null): string {
  return (v ?? '').trim();
}

/**
 * Pure mapper: adapter input + live preflight → Pons TokenParams.
 * creatorFeeRecipient is always the connected creator (LaunchAndBuy rejects zero).
 */
export function buildPonsTokenParams(args: {
  input: PonsLaunchAdapterInput;
  preflight: Pick<PonsPreflightResult, 'expectedEconomics'>;
  salt?: Hex;
}): PonsTokenParams {
  const { input, preflight } = args;
  const creator = getAddress(input.creator) as `0x${string}`;
  const name = str(input.name);
  const symbol = str(input.symbol);
  const logo = str(input.logo);
  const description = str(input.description);

  if (!name || !symbol) {
    throw new PonsAdapterError('INVALID_INPUT', 'Token name and symbol are required.');
  }
  if (!logo) {
    throw new PonsAdapterError('INVALID_INPUT', 'Token logo (IPFS URI) is required.');
  }

  const salt = resolvePonsSalt(args.salt ?? input.salt);

  return {
    name,
    symbol,
    logo,
    description,
    socials: {
      twitter: str(input.twitter),
      telegram: str(input.telegram),
      discord: str(input.discord),
      website: str(input.website),
      farcaster: str(input.farcaster),
    },
    creatorFeeRecipient: creator,
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buybackEnabled,
    expectedEconomics: preflight.expectedEconomics,
    salt,
  };
}

/**
 * Native ETH LaunchAndBuy request (no broadcast).
 * Locked: config 0, pairToken=0, recipient=creator, exemptions=[].
 */
export function buildPonsLaunchAndBuyArgs(args: {
  input: PonsLaunchAdapterInput;
  preflight: PonsPreflightResult;
  params: PonsTokenParams;
  minTokensOut: bigint;
}): PonsLaunchAndBuyRequest {
  const { input, preflight, params, minTokensOut } = args;
  const creator = getAddress(input.creator) as `0x${string}`;

  if (input.quoteInWei <= BigInt(0)) {
    throw new PonsAdapterError(
      'ZERO_DEV_BUY',
      'Every SCOOP Pons launch requires a positive creator/dev buy.',
    );
  }
  if (minTokensOut <= BigInt(0)) {
    throw new PonsAdapterError('INVALID_INPUT', 'minTokensOut must be positive.');
  }
  if (params.creatorFeeRecipient.toLowerCase() !== creator.toLowerCase()) {
    throw new PonsAdapterError(
      'CREATOR_MISMATCH',
      'creatorFeeRecipient must equal the connected creator wallet.',
    );
  }

  const value = preflight.launchFeeWei + input.quoteInWei;
  if (value !== preflight.requiredMsgValueWei) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'msg.value must equal live launchFee + quoteIn.',
    );
  }

  return {
    address: PONS_V2_LAUNCH_AND_BUY,
    abi: ponsLaunchAndBuyWriteAbi,
    functionName: 'launchAndBuy',
    args: [
      params,
      PONS_LAUNCH_CONFIG_ID,
      PONS_NATIVE_PAIR_TOKEN,
      input.quoteInWei,
      minTokensOut,
      creator,
      [],
    ] as const,
    value,
    account: creator,
    chainId: PONS_V2_CHAIN_ID,
  };
}
