import {
  decodeEventLog,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { scoopV1MainnetCanaryManifest } from '@scoop/shared';
import { scoopFactoryLaunchAbi } from '@/lib/launch/factory-abi';
import type { DecodedTokenLaunched } from '@/lib/launch/tx-state';

const DEFAULT_FACTORY =
  scoopV1MainnetCanaryManifest.contracts.ScoopFactory as `0x${string}`;

/** TokenLaunched fragment for decode (matches ScoopFactory ABI). */
export const tokenLaunchedEventAbi = [
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'creatorId', type: 'bytes32', indexed: true },
      { name: 'quoteAsset', type: 'address', indexed: false },
      { name: 'feeDistributor', type: 'address', indexed: false },
      { name: 'liquidityLocker', type: 'address', indexed: false },
      { name: 'poolId', type: 'bytes32', indexed: false },
      { name: 'lpTokenId', type: 'uint256', indexed: false },
      { name: 'openingSqrtPriceX96', type: 'uint160', indexed: false },
      { name: 'openingTick', type: 'int24', indexed: false },
      { name: 'tickLower', type: 'int24', indexed: false },
      { name: 'tickUpper', type: 'int24', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
    ],
  },
] as const;

export type DecodeLaunchResult =
  | { ok: true; decoded: DecodedTokenLaunched }
  | { ok: false; reason: string };

export type DecodedInitialBuy = {
  token: `0x${string}`;
  buyer: `0x${string}`;
  quoteAsset: `0x${string}`;
  quoteAmountIn: string;
  tokensOut: string;
};

export type DecodeInitialBuyResult =
  | { ok: true; decoded: DecodedInitialBuy }
  | { ok: false; reason: string };

/** InitialBuyExecuted fragment (deployer indexed field = msg.sender buyer). */
export const initialBuyExecutedEventAbi = [
  {
    type: 'event',
    name: 'InitialBuyExecuted',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'quoteAsset', type: 'address', indexed: true },
      { name: 'quoteAmountIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Decode TokenLaunched from a successful receipt.
 * Does not fabricate addresses on failure.
 */
export function decodeTokenLaunchedFromReceipt(
  receipt: Pick<TransactionReceipt, 'logs' | 'status'>,
  factoryAddress: string = DEFAULT_FACTORY,
): DecodeLaunchResult {
  if (receipt.status !== 'success') {
    return { ok: false, reason: 'receipt_not_success' };
  }

  const factory = factoryAddress.toLowerCase();
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== factory) continue;
    try {
      const decoded = decodeEventLog({
        abi: tokenLaunchedEventAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'TokenLaunched') continue;
      const args = decoded.args as {
        token: Hex;
        deployer: Hex;
        creatorId: Hex;
        quoteAsset: Hex;
        feeDistributor: Hex;
        liquidityLocker: Hex;
        poolId: Hex;
        lpTokenId: bigint;
        name: string;
        symbol: string;
      };
      return {
        ok: true,
        decoded: {
          token: args.token.toLowerCase() as `0x${string}`,
          deployer: args.deployer.toLowerCase() as `0x${string}`,
          creatorId: args.creatorId.toLowerCase() as `0x${string}`,
          quoteAsset: args.quoteAsset.toLowerCase() as `0x${string}`,
          feeDistributor: args.feeDistributor.toLowerCase() as `0x${string}`,
          liquidityLocker: args.liquidityLocker.toLowerCase() as `0x${string}`,
          poolId: args.poolId.toLowerCase() as `0x${string}`,
          lpTokenId: args.lpTokenId.toString(),
          name: args.name,
          symbol: args.symbol,
        },
      };
    } catch {
      // try next log
    }
  }

  // Fallback: try full factory ABI in case fragment diverges
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== factory) continue;
    try {
      const decoded = decodeEventLog({
        abi: scoopFactoryLaunchAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'TokenLaunched') continue;
    } catch {
      // ignore
    }
  }

  return { ok: false, reason: 'token_launched_not_found' };
}

/**
 * Decode InitialBuyExecuted from a successful launchAndBuy receipt.
 */
export function decodeInitialBuyFromReceipt(
  receipt: Pick<TransactionReceipt, 'logs' | 'status'>,
  factoryAddress: string = DEFAULT_FACTORY,
): DecodeInitialBuyResult {
  if (receipt.status !== 'success') {
    return { ok: false, reason: 'receipt_not_success' };
  }

  const factory = factoryAddress.toLowerCase();
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== factory) continue;
    try {
      const decoded = decodeEventLog({
        abi: initialBuyExecutedEventAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'InitialBuyExecuted') continue;
      const args = decoded.args as {
        token: Hex;
        deployer: Hex;
        quoteAsset: Hex;
        quoteAmountIn: bigint;
        tokensOut: bigint;
      };
      return {
        ok: true,
        decoded: {
          token: args.token.toLowerCase() as `0x${string}`,
          buyer: args.deployer.toLowerCase() as `0x${string}`,
          quoteAsset: args.quoteAsset.toLowerCase() as `0x${string}`,
          quoteAmountIn: args.quoteAmountIn.toString(),
          tokensOut: args.tokensOut.toString(),
        },
      };
    } catch {
      // try next log
    }
  }

  return { ok: false, reason: 'initial_buy_not_found' };
}

export function assertInitialBuyMatches(args: {
  decoded: DecodedInitialBuy;
  token: string;
  buyer: string;
  quoteAsset: string;
  quoteAmountIn: bigint;
}): boolean {
  return (
    args.decoded.token.toLowerCase() === args.token.toLowerCase() &&
    args.decoded.buyer.toLowerCase() === args.buyer.toLowerCase() &&
    args.decoded.quoteAsset.toLowerCase() === args.quoteAsset.toLowerCase() &&
    args.decoded.quoteAmountIn === args.quoteAmountIn.toString()
  );
}

export function assertCreatorIdMatches(
  expected: string,
  decoded: DecodedTokenLaunched,
): boolean {
  return expected.toLowerCase() === decoded.creatorId.toLowerCase();
}

export function assertDeployerMatches(
  expected: string,
  decoded: DecodedTokenLaunched,
): boolean {
  return expected.toLowerCase() === decoded.deployer.toLowerCase();
}
