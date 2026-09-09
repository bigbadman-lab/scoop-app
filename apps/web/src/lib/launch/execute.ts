/**
 * Production wallet launch path (V2.C / V2.G).
 * launch when no ETH buy; launchAndBuy when ETH quoteAmountIn > 0.
 * Mandatory simulate → account/chain recheck → write → receipt.
 */
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
  WriteContractParameters,
} from 'viem';
import { scoopV1MainnetCanaryManifest } from '@scoop/shared';
import type { FactoryLaunchParams } from '@/lib/launch/build-launch-params';
import {
  computeMinTokensOut,
  LAUNCH_DEV_BUY_SLIPPAGE_BPS,
  selectLaunchFunction,
  type LaunchWriteFunction,
} from '@/lib/launch/dev-buy';
import { scoopFactoryLaunchAbi } from '@/lib/launch/factory-abi';
import { LAUNCH_FEE_WEI } from '@/lib/launch/types';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

/** Enables production Factory writes (human-approved only). */
export const LAUNCH_WRITE_ENABLED = true as const;

export const SCOOP_FACTORY_ADDRESS =
  scoopV1MainnetCanaryManifest.contracts.ScoopFactory as `0x${string}`;

/** Probe floor for quote simulation only — never used on the write. */
const QUOTE_PROBE_MIN_TOKENS_OUT = BigInt(1);

export type PreparedLaunchRequest = {
  address: `0x${string}`;
  abi: typeof scoopFactoryLaunchAbi;
  functionName: LaunchWriteFunction;
  args:
    | readonly [FactoryLaunchParams]
    | readonly [FactoryLaunchParams, bigint, bigint];
  value: bigint;
  chainId: number;
  account: `0x${string}`;
  quoteAmountIn: bigint;
  minTokensOut: bigint;
  expectedTokensOut: bigint;
  slippageBps: number;
  launchFeeWei: bigint;
};

/**
 * Build a launch-only request (fee only).
 */
export function prepareWalletLaunchRequest(args: {
  params: FactoryLaunchParams;
  account: `0x${string}`;
  launchFeeWei: bigint;
}): PreparedLaunchRequest {
  if (args.launchFeeWei <= BigInt(0)) {
    throw new Error('Launch fee must be positive.');
  }
  const functionName = selectLaunchFunction({
    quoteAsset: args.params.quoteAsset,
    quoteAmountInWei: BigInt(0),
  });
  if (functionName !== 'launch') {
    throw new Error('Internal: zero buy must select launch.');
  }
  return {
    address: SCOOP_FACTORY_ADDRESS,
    abi: scoopFactoryLaunchAbi,
    functionName: 'launch',
    args: [args.params],
    value: args.launchFeeWei,
    chainId: ROBINHOOD_CHAIN_ID,
    account: args.account.toLowerCase() as `0x${string}`,
    quoteAmountIn: BigInt(0),
    minTokensOut: BigInt(0),
    expectedTokensOut: BigInt(0),
    slippageBps: LAUNCH_DEV_BUY_SLIPPAGE_BPS,
    launchFeeWei: args.launchFeeWei,
  };
}

/**
 * Build launchAndBuy request with known minTokensOut.
 * msg.value = launchFee + quoteAmountIn (ETH quote only).
 */
export function prepareWalletLaunchAndBuyRequest(args: {
  params: FactoryLaunchParams;
  account: `0x${string}`;
  launchFeeWei: bigint;
  quoteAmountIn: bigint;
  minTokensOut: bigint;
  expectedTokensOut: bigint;
  slippageBps?: number;
}): PreparedLaunchRequest {
  if (args.launchFeeWei <= BigInt(0)) {
    throw new Error('Launch fee must be positive.');
  }
  if (args.quoteAmountIn <= BigInt(0)) {
    throw new Error('quoteAmountIn must be positive for launchAndBuy.');
  }
  if (args.minTokensOut <= BigInt(0)) {
    throw new Error('minTokensOut must be positive.');
  }
  const functionName = selectLaunchFunction({
    quoteAsset: args.params.quoteAsset,
    quoteAmountInWei: args.quoteAmountIn,
  });
  if (functionName !== 'launchAndBuy') {
    throw new Error('launchAndBuy requires native ETH quote and positive buy.');
  }
  return {
    address: SCOOP_FACTORY_ADDRESS,
    abi: scoopFactoryLaunchAbi,
    functionName: 'launchAndBuy',
    args: [args.params, args.quoteAmountIn, args.minTokensOut],
    value: args.launchFeeWei + args.quoteAmountIn,
    chainId: ROBINHOOD_CHAIN_ID,
    account: args.account.toLowerCase() as `0x${string}`,
    quoteAmountIn: args.quoteAmountIn,
    minTokensOut: args.minTokensOut,
    expectedTokensOut: args.expectedTokensOut,
    slippageBps: args.slippageBps ?? LAUNCH_DEV_BUY_SLIPPAGE_BPS,
    launchFeeWei: args.launchFeeWei,
  };
}

/** Read Factory.LAUNCH_FEE; fall back to known immutable constant if RPC fails. */
export async function readLaunchFeeWei(
  publicClient: PublicClient,
): Promise<{ feeWei: bigint; source: 'contract' | 'constant' }> {
  try {
    const fee = await publicClient.readContract({
      address: SCOOP_FACTORY_ADDRESS,
      abi: scoopFactoryLaunchAbi,
      functionName: 'LAUNCH_FEE',
    });
    const feeWei = BigInt(fee);
    if (feeWei <= BigInt(0)) {
      throw new Error('LAUNCH_FEE returned zero');
    }
    return { feeWei, source: 'contract' };
  } catch {
    return { feeWei: LAUNCH_FEE_WEI, source: 'constant' };
  }
}

export async function simulateLaunch(args: {
  publicClient: PublicClient;
  request: PreparedLaunchRequest;
}): Promise<{
  request: WriteContractParameters;
  result: unknown;
}> {
  const { request, result } = await args.publicClient.simulateContract({
    address: args.request.address,
    abi: args.request.abi,
    functionName: args.request.functionName,
    args: args.request.args,
    value: args.request.value,
    account: args.request.account,
    chain: args.publicClient.chain,
  });
  return { request: request as WriteContractParameters, result };
}

/**
 * Quote expected tokens via probe sim (minTokensOut=1), then authoritative
 * sim with slippage-protected minTokensOut. Write must use the final request.
 */
export async function prepareAndSimulateLaunchWrite(args: {
  publicClient: PublicClient;
  params: FactoryLaunchParams;
  account: `0x${string}`;
  launchFeeWei: bigint;
  quoteAmountIn: bigint;
  slippageBps?: number;
}): Promise<{
  prepared: PreparedLaunchRequest;
  simulatedRequest: WriteContractParameters;
}> {
  const slippageBps = args.slippageBps ?? LAUNCH_DEV_BUY_SLIPPAGE_BPS;

  if (args.quoteAmountIn <= BigInt(0)) {
    const prepared = prepareWalletLaunchRequest({
      params: args.params,
      account: args.account,
      launchFeeWei: args.launchFeeWei,
    });
    const sim = await simulateLaunch({
      publicClient: args.publicClient,
      request: prepared,
    });
    return { prepared, simulatedRequest: sim.request };
  }

  const probe = prepareWalletLaunchAndBuyRequest({
    params: args.params,
    account: args.account,
    launchFeeWei: args.launchFeeWei,
    quoteAmountIn: args.quoteAmountIn,
    minTokensOut: QUOTE_PROBE_MIN_TOKENS_OUT,
    expectedTokensOut: BigInt(0),
    slippageBps,
  });

  const probeSim = await simulateLaunch({
    publicClient: args.publicClient,
    request: probe,
  });

  const tokensBought = extractTokensBought(probeSim.result);
  if (tokensBought <= BigInt(0)) {
    throw new Error('Simulation returned zero tokens for initial buy.');
  }

  const minTokensOut = computeMinTokensOut(tokensBought, slippageBps);
  const prepared = prepareWalletLaunchAndBuyRequest({
    params: args.params,
    account: args.account,
    launchFeeWei: args.launchFeeWei,
    quoteAmountIn: args.quoteAmountIn,
    minTokensOut,
    expectedTokensOut: tokensBought,
    slippageBps,
  });

  const finalSim = await simulateLaunch({
    publicClient: args.publicClient,
    request: prepared,
  });

  return { prepared, simulatedRequest: finalSim.request };
}

function extractTokensBought(result: unknown): bigint {
  // viem returns tuple array for multiple outputs; tokensBought is index 5.
  if (Array.isArray(result) && result.length >= 6) {
    return BigInt(result[5] as bigint | number | string);
  }
  if (
    result &&
    typeof result === 'object' &&
    'tokensBought' in result &&
    (result as { tokensBought: unknown }).tokensBought != null
  ) {
    return BigInt((result as { tokensBought: bigint | number | string }).tokensBought);
  }
  throw new Error('Could not read tokensBought from launchAndBuy simulation.');
}

export class LaunchAccountChangedError extends Error {
  constructor(message = 'Wallet account changed after simulation. Retry launch.') {
    super(message);
    this.name = 'LaunchAccountChangedError';
  }
}

export class LaunchChainChangedError extends Error {
  constructor(message = 'Network changed after simulation. Switch to Robinhood Chain and retry.') {
    super(message);
    this.name = 'LaunchChainChangedError';
  }
}

/**
 * Re-validate account + chain, then write using the simulated request.
 */
export async function writeLaunchAfterSimulation(args: {
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  simulatedRequest: WriteContractParameters;
  simulatedAccount: `0x${string}`;
  liveAccount: `0x${string}`;
  liveChainId: number | undefined;
}): Promise<`0x${string}`> {
  if (!LAUNCH_WRITE_ENABLED) {
    throw new Error('Launch writes are disabled.');
  }
  if (args.liveAccount.toLowerCase() !== args.simulatedAccount.toLowerCase()) {
    throw new LaunchAccountChangedError();
  }
  if (args.liveChainId !== ROBINHOOD_CHAIN_ID) {
    throw new LaunchChainChangedError();
  }

  const hash = await args.walletClient.writeContract({
    ...args.simulatedRequest,
    account: args.liveAccount,
    chain: args.walletClient.chain,
  });
  return hash;
}

export function shortenLaunchError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return 'Launch failed.';
  if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
    return 'Wallet rejected the transaction.';
  }
  if (/insufficient funds|exceeds balance/i.test(msg)) {
    return 'Insufficient funds for launch fee, initial buy, and gas.';
  }
  if (/LAUNCH_WRITE|disabled/i.test(msg)) {
    return 'Launch writes are disabled.';
  }
  if (/Initial buy is currently available/i.test(msg)) {
    return msg;
  }
  if (/PINATA|IPFS pin|pinning/i.test(msg)) {
    return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
  }
  return msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
}
