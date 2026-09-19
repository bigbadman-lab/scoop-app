import type { PublicClient } from 'viem';
import { getAddress } from 'viem';
import { ponsFactoryReadAbi } from './abi';
import {
  PONS_LAUNCH_CONFIG_ID,
  PONS_NATIVE_PAIR_TOKEN,
  PONS_V2_CHAIN_ID,
  PONS_V2_FACTORY,
} from './constants';
import { PonsAdapterError } from './errors';
import type { PonsLaunchAdapterInput, PonsPreflightResult } from './types';

export type PonsPreflightDeps = {
  publicClient: PublicClient;
  chainId: number;
  input: Pick<
    PonsLaunchAdapterInput,
    'creator' | 'quoteInWei' | 'creatorTaxBps'
  >;
};

/**
 * Read-only Pons V2 preflight for native ETH LaunchAndBuy.
 * Does not check approvedPairTokens(address(0)) — native ETH is special-cased.
 */
export async function runPonsPreflight(
  deps: PonsPreflightDeps,
): Promise<PonsPreflightResult> {
  const { publicClient, chainId, input } = deps;
  const creator = getAddress(input.creator) as `0x${string}`;

  if (chainId !== PONS_V2_CHAIN_ID) {
    throw new PonsAdapterError(
      'WRONG_CHAIN',
      `Switch to Robinhood Chain (${PONS_V2_CHAIN_ID}).`,
    );
  }

  if (input.quoteInWei <= BigInt(0)) {
    throw new PonsAdapterError(
      'ZERO_DEV_BUY',
      'Every SCOOP Pons launch requires a positive creator/dev buy.',
    );
  }

  if (
    !Number.isInteger(input.creatorTaxBps) ||
    input.creatorTaxBps < 0 ||
    input.creatorTaxBps > 65_535
  ) {
    throw new PonsAdapterError('INVALID_INPUT', 'creatorTaxBps must be a uint16 integer.');
  }

  const factory = PONS_V2_FACTORY;
  const launchConfigId = PONS_LAUNCH_CONFIG_ID;
  const pairToken = PONS_NATIVE_PAIR_TOKEN;

  const [
    canLaunch,
    launchEnabled,
    launchFeeWei,
    config,
    expectedEconomics,
    maxCreatorTaxBps,
    creatorEthBalance,
  ] = await Promise.all([
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'canLaunch',
      args: [creator],
    }),
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'launchEnabled',
    }),
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'launchFee',
    }),
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'getLaunchConfig',
      args: [launchConfigId],
    }),
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'previewLaunchEconomics',
      args: [launchConfigId, pairToken],
    }),
    publicClient.readContract({
      address: factory,
      abi: ponsFactoryReadAbi,
      functionName: 'maxCreatorTaxBps',
    }),
    publicClient.getBalance({ address: creator }),
  ]);

  const cfg = config as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    number,
    boolean,
  ];
  const supply = cfg[0];
  const curveFeeBps = cfg[1];
  const phantomQuote = cfg[2];
  const graduationThreshold = cfg[3];
  const configEnabled = cfg[6];

  if (!canLaunch) {
    throw new PonsAdapterError(
      'LAUNCH_NOT_ALLOWED',
      'This wallet cannot launch on Pons right now (canLaunch=false).',
    );
  }

  if (!configEnabled) {
    throw new PonsAdapterError(
      'CONFIG_DISABLED',
      'Pons launch config 0 is disabled.',
    );
  }

  if (input.creatorTaxBps > Number(maxCreatorTaxBps)) {
    throw new PonsAdapterError(
      'CREATOR_TAX_TOO_HIGH',
      `Creator tax ${input.creatorTaxBps} bps exceeds max ${maxCreatorTaxBps} bps.`,
      { ponsError: 'CreatorTaxTooHigh' },
    );
  }

  const requiredMsgValueWei = launchFeeWei + input.quoteInWei;
  if (creatorEthBalance < requiredMsgValueWei) {
    throw new PonsAdapterError(
      'INSUFFICIENT_ETH',
      'Insufficient ETH for launch fee plus creator buy.',
    );
  }

  return {
    chainId,
    canLaunch,
    launchEnabled,
    launchFeeWei,
    launchConfigId,
    pairToken,
    configEnabled,
    configSupply: supply,
    configCurveFeeBps: curveFeeBps,
    configPhantomQuote: phantomQuote,
    configGraduationThreshold: graduationThreshold,
    expectedEconomics,
    maxCreatorTaxBps: Number(maxCreatorTaxBps),
    creatorEthBalance,
    quoteInWei: input.quoteInWei,
    requiredMsgValueWei,
  };
}
