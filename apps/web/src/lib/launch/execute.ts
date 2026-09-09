/**
 * Production wallet launch path (V2.C).
 * Always uses ScoopFactory.launch — never launchAndBuy in this phase.
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
import { scoopFactoryLaunchAbi } from '@/lib/launch/factory-abi';
import { LAUNCH_FEE_WEI } from '@/lib/launch/types';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

/** V2.C enables production Factory.launch writes (human-approved only). */
export const LAUNCH_WRITE_ENABLED = true as const;

export const SCOOP_FACTORY_ADDRESS =
  scoopV1MainnetCanaryManifest.contracts.ScoopFactory as `0x${string}`;

export type PreparedLaunchRequest = {
  address: `0x${string}`;
  abi: typeof scoopFactoryLaunchAbi;
  functionName: 'launch';
  args: readonly [FactoryLaunchParams];
  value: bigint;
  chainId: number;
  /** Account used for simulation — must still be active at write. */
  account: `0x${string}`;
};

/**
 * V2.C: wallet launch only — never selects launchAndBuy.
 * msg.value = authoritative launch fee (passed in).
 */
export function prepareWalletLaunchRequest(args: {
  params: FactoryLaunchParams;
  account: `0x${string}`;
  launchFeeWei: bigint;
}): PreparedLaunchRequest {
  if (args.launchFeeWei <= BigInt(0)) {
    throw new Error('Launch fee must be positive.');
  }
  return {
    address: SCOOP_FACTORY_ADDRESS,
    abi: scoopFactoryLaunchAbi,
    functionName: 'launch',
    args: [args.params],
    value: args.launchFeeWei,
    chainId: ROBINHOOD_CHAIN_ID,
    account: args.account.toLowerCase() as `0x${string}`,
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
    // ScoopFactory.LAUNCH_FEE is an immutable public constant (0.0005 ether).
    return { feeWei: LAUNCH_FEE_WEI, source: 'constant' };
  }
}

export async function simulateLaunch(args: {
  publicClient: PublicClient;
  request: PreparedLaunchRequest;
}): Promise<{
  request: WriteContractParameters;
}> {
  const { request } = await args.publicClient.simulateContract({
    address: args.request.address,
    abi: args.request.abi,
    functionName: args.request.functionName,
    args: args.request.args,
    value: args.request.value,
    account: args.request.account,
    chain: args.publicClient.chain,
  });
  return { request: request as WriteContractParameters };
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
 * Does not wait for receipt — caller owns confirming phase.
 */
export async function writeLaunchAfterSimulation(args: {
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  simulatedRequest: WriteContractParameters;
  /** Account that was simulated. */
  simulatedAccount: `0x${string}`;
  /** Live account immediately before write. */
  liveAccount: `0x${string}`;
  /** Live chain id immediately before write. */
  liveChainId: number | undefined;
}): Promise<`0x${string}`> {
  if (!LAUNCH_WRITE_ENABLED) {
    throw new Error('Launch writes are disabled.');
  }
  if (
    args.liveAccount.toLowerCase() !== args.simulatedAccount.toLowerCase()
  ) {
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
    return 'Insufficient funds for launch fee and gas.';
  }
  if (/LAUNCH_WRITE|disabled/i.test(msg)) {
    return 'Launch writes are disabled.';
  }
  if (/PINATA|IPFS pin|pinning/i.test(msg)) {
    return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
  }
  return msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
}
