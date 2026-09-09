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
