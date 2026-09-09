import {
  decodeErrorResult,
  type PublicClient,
} from 'viem';
import { universalRouterAbi } from '@/lib/trade/abis';
import { SCOOP_TRADE_ADDRESSES, SWAP_DEADLINE_SECONDS } from '@/lib/trade/constants';
import { buildUniversalRouterV4SwapCall } from '@/lib/trade/encode-v4-swap';
import type { ScoopPoolKey } from '@/lib/trade/pool-key';

/**
 * IV4Router.V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)
 * Quoting pattern: simulate with unreachable minOut; parse amountReceived from revert.
 * Selector 0x8b063d73 = keccak256("V4TooLittleReceived(uint256,uint256)")[0:4]
 */
const V4_TOO_LITTLE_RECEIVED_ABI = [
  {
    type: 'error',
    name: 'V4TooLittleReceived',
    inputs: [
      { name: 'minAmountOutReceived', type: 'uint256' },
      { name: 'amountReceived', type: 'uint256' },
    ],
  },
] as const;

const V4_TOO_LITTLE_SELECTOR = '8b063d73';
const UINT128_MAX = BigInt('0xffffffffffffffffffffffffffffffff');

function extractRevertData(error: unknown): `0x${string}` | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as {
    data?: unknown;
    cause?: { data?: unknown; raw?: unknown; cause?: { data?: unknown } };
  };
  const candidates = [e.data, e.cause?.data, e.cause?.raw, e.cause?.cause?.data];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('0x') && c.length >= 10) {
      return c as `0x${string}`;
    }
    if (c && typeof c === 'object' && 'data' in c) {
      const inner = (c as { data?: unknown }).data;
      if (typeof inner === 'string' && inner.startsWith('0x')) return inner as `0x${string}`;
    }
  }
  // wagmi/viem sometimes stringifies the error message with hex
  if (error instanceof Error) {
    const match = error.message.match(/0x[0-9a-fA-F]{8,}/);
    if (match) return match[0] as `0x${string}`;
  }
  return null;
}

function tryDecodeAmountReceived(data: `0x${string}`): bigint | null {
  try {
    const decoded = decodeErrorResult({
      abi: V4_TOO_LITTLE_RECEIVED_ABI,
      data,
    });
    if (decoded.errorName === 'V4TooLittleReceived') {
      const amountReceived = decoded.args[1] as bigint;
      if (amountReceived > BigInt(0)) return amountReceived;
    }
  } catch {
    /* continue */
  }
  return null;
}

export function parseAmountReceivedFromRevert(error: unknown): bigint | null {
  const data = extractRevertData(error);
  if (!data) return null;

  const direct = tryDecodeAmountReceived(data);
  if (direct != null) return direct;

  const lower = data.toLowerCase().replace(/^0x/, '');
  const idx = lower.indexOf(V4_TOO_LITTLE_SELECTOR);
  if (idx >= 0) {
    const slice = `0x${lower.slice(idx)}` as `0x${string}`;
    return tryDecodeAmountReceived(slice);
  }
  return null;
}

export type ExactInQuote = {
  amountIn: bigint;
  amountOut: bigint;
  zeroForOne: boolean;
};

/**
 * Quote exact-in via eth_call of the canonical UR V4 path.
 * Uses unreachable minOut so the router reverts with V4TooLittleReceived(amountReceived).
 * Does not use spot×size.
 */
export async function quoteExactInViaSimulation(args: {
  publicClient: PublicClient;
  account: `0x${string}`;
  poolKey: ScoopPoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  value: bigint;
}): Promise<ExactInQuote> {
  if (args.amountIn <= BigInt(0)) throw new Error('Enter an amount greater than zero');

  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  const call = buildUniversalRouterV4SwapCall({
    poolKey: args.poolKey,
    zeroForOne: args.zeroForOne,
    amountIn: args.amountIn,
    amountOutMinimum: UINT128_MAX,
    deadline,
  });

  try {
    await args.publicClient.simulateContract({
      address: SCOOP_TRADE_ADDRESSES.universalRouter,
      abi: universalRouterAbi,
      functionName: 'execute',
      args: [call.commands, call.inputs, call.deadline],
      account: args.account,
      value: args.value,
    });
    throw new Error('Quote simulation did not return an amount');
  } catch (error) {
    if (error instanceof Error && error.message === 'Quote simulation did not return an amount') {
      throw error;
    }
    const amountOut = parseAmountReceivedFromRevert(error);
    if (amountOut != null && amountOut > BigInt(0)) {
      return {
        amountIn: args.amountIn,
        amountOut,
        zeroForOne: args.zeroForOne,
      };
    }
    const message = error instanceof Error ? error.message : 'Quote simulation failed';
    throw new Error(`Unable to quote this trade (${message.slice(0, 180)})`);
  }
}
