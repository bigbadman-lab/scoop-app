import type { PublicClient, WalletClient } from 'viem';
import { erc20Abi, permit2Abi, universalRouterAbi } from '@/lib/trade/abis';
import { SCOOP_TRADE_ADDRESSES, SWAP_DEADLINE_SECONDS } from '@/lib/trade/constants';
import { buildUniversalRouterV4SwapCall } from '@/lib/trade/encode-v4-swap';
import { isNativeCurrency, type ScoopPoolKey } from '@/lib/trade/pool-key';

const MAX_UINT160 = BigInt('0xffffffffffffffffffffffffffffffffffffffff');
const MAX_UINT48 = BigInt(0xffffffffffff);
const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
);

export type Permit2Allowance = {
  amount: bigint;
  expiration: number;
  nonce: number;
};

export async function readErc20Allowance(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
}): Promise<bigint> {
  return args.publicClient.readContract({
    address: args.token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [args.owner, args.spender],
  });
}

export async function readPermit2Allowance(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
}): Promise<Permit2Allowance> {
  const [amount, expiration, nonce] = await args.publicClient.readContract({
    address: SCOOP_TRADE_ADDRESSES.permit2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [args.owner, args.token, args.spender],
  });
  return {
    amount: BigInt(amount),
    expiration: Number(expiration),
    nonce: Number(nonce),
  };
}

/** True when ERC20→Permit2 and Permit2→UniversalRouter both cover amountIn. */
export async function hasSellApprovals(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  amountIn: bigint;
  nowSec?: number;
}): Promise<{ erc20Ok: boolean; permit2Ok: boolean; ready: boolean }> {
  const now = args.nowSec ?? Math.floor(Date.now() / 1000);
  const [erc20, permit2] = await Promise.all([
    readErc20Allowance({
      publicClient: args.publicClient,
      token: args.token,
      owner: args.owner,
      spender: SCOOP_TRADE_ADDRESSES.permit2,
    }),
    readPermit2Allowance({
      publicClient: args.publicClient,
      token: args.token,
      owner: args.owner,
      spender: SCOOP_TRADE_ADDRESSES.universalRouter,
    }),
  ]);
  const erc20Ok = erc20 >= args.amountIn;
  const permit2Ok = permit2.amount >= args.amountIn && permit2.expiration > now;
  return { erc20Ok, permit2Ok, ready: erc20Ok && permit2Ok };
}

/**
 * Proven scoop-protocol sell approval:
 * token.approve(Permit2, max) then Permit2.approve(token, UniversalRouter, maxUint160, maxUint48)
 */
export async function approveTokenForUniversalRouter(args: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: `0x${string}`;
  token: `0x${string}`;
  needErc20: boolean;
  needPermit2: boolean;
}): Promise<`0x${string}`[]> {
  const hashes: `0x${string}`[] = [];
  if (args.needErc20) {
    const hash = await args.walletClient.writeContract({
      account: args.account,
      chain: args.walletClient.chain,
      address: args.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [SCOOP_TRADE_ADDRESSES.permit2, MAX_UINT256],
    });
    hashes.push(hash);
    const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Token approval failed');
  }
  if (args.needPermit2) {
    const hash = await args.walletClient.writeContract({
      account: args.account,
      chain: args.walletClient.chain,
      address: SCOOP_TRADE_ADDRESSES.permit2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [
        args.token,
        SCOOP_TRADE_ADDRESSES.universalRouter,
        MAX_UINT160,
        Number(MAX_UINT48),
      ],
    });
    hashes.push(hash);
    const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Permit2 approval failed');
  }
  return hashes;
}

export async function simulateAndExecuteV4Swap(args: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: `0x${string}`;
  poolKey: ScoopPoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): Promise<{ hash: `0x${string}`; success: boolean }> {
  if (args.amountOutMinimum <= BigInt(0)) {
    throw new Error('Minimum receive must be greater than zero');
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  const call = buildUniversalRouterV4SwapCall({
    poolKey: args.poolKey,
    zeroForOne: args.zeroForOne,
    amountIn: args.amountIn,
    amountOutMinimum: args.amountOutMinimum,
    deadline,
  });

  // Mandatory simulation before broadcast
  await args.publicClient.simulateContract({
    address: SCOOP_TRADE_ADDRESSES.universalRouter,
    abi: universalRouterAbi,
    functionName: 'execute',
    args: [call.commands, call.inputs, call.deadline],
    account: args.account,
    value: call.value,
  });

  const hash = await args.walletClient.writeContract({
    account: args.account,
    chain: args.walletClient.chain,
    address: SCOOP_TRADE_ADDRESSES.universalRouter,
    abi: universalRouterAbi,
    functionName: 'execute',
    args: [call.commands, call.inputs, call.deadline],
    value: call.value,
  });

  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  return { hash, success: receipt.status === 'success' };
}

export function settleNeedsNativeValue(settleCurrency: string, amountIn: bigint): bigint {
  return isNativeCurrency(settleCurrency) ? amountIn : BigInt(0);
}
