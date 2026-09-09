import {
  encodeAbiParameters,
  encodePacked,
  type Hex,
} from 'viem';
import {
  UR_CMD_V4_SWAP,
  V4_ACTION_SETTLE_ALL,
  V4_ACTION_SWAP_EXACT_IN_SINGLE,
  V4_ACTION_TAKE_ALL,
} from '@/lib/trade/constants';
import type { ScoopPoolKey } from '@/lib/trade/pool-key';
import { settleTakeCurrencies } from '@/lib/trade/pool-key';

/**
 * Port of ScoopFactory._encodeV4ExactInSingle / SwapFork._encodeV4ExactInSingle.
 * Preserves: SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL, minHopPriceX36=0, empty hookData.
 */
export function encodeV4ExactInSingleInput(args: {
  poolKey: ScoopPoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): Hex {
  if (args.amountIn <= BigInt(0)) throw new Error('amountIn must be positive');
  if (args.amountIn > BigInt('0xffffffffffffffffffffffffffffffff')) {
    throw new Error('amountIn exceeds uint128');
  }
  if (args.amountOutMinimum < BigInt(0)) throw new Error('amountOutMinimum must be non-negative');
  if (args.amountOutMinimum > BigInt('0xffffffffffffffffffffffffffffffff')) {
    throw new Error('amountOutMinimum exceeds uint128');
  }

  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [V4_ACTION_SWAP_EXACT_IN_SINGLE, V4_ACTION_SETTLE_ALL, V4_ACTION_TAKE_ALL],
  );

  const { settle, take } = settleTakeCurrencies({
    poolKey: args.poolKey,
    zeroForOne: args.zeroForOne,
  });

  const swapParams = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            name: 'poolKey',
            components: [
              { type: 'address', name: 'currency0' },
              { type: 'address', name: 'currency1' },
              { type: 'uint24', name: 'fee' },
              { type: 'int24', name: 'tickSpacing' },
              { type: 'address', name: 'hooks' },
            ],
          },
          { type: 'bool', name: 'zeroForOne' },
          { type: 'uint128', name: 'amountIn' },
          { type: 'uint128', name: 'amountOutMinimum' },
          { type: 'uint256', name: 'minHopPriceX36' },
          { type: 'bytes', name: 'hookData' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0: args.poolKey.currency0,
          currency1: args.poolKey.currency1,
          fee: args.poolKey.fee,
          tickSpacing: args.poolKey.tickSpacing,
          hooks: args.poolKey.hooks,
        },
        zeroForOne: args.zeroForOne,
        amountIn: args.amountIn,
        amountOutMinimum: args.amountOutMinimum,
        minHopPriceX36: BigInt(0),
        hookData: '0x',
      },
    ],
  );

  const settleParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [settle, args.amountIn],
  );
  const takeParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [take, args.amountOutMinimum],
  );

  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [swapParams, settleParams, takeParams]],
  );
}

/** Universal Router execute(commands, inputs, deadline) payload. */
export function buildUniversalRouterV4SwapCall(args: {
  poolKey: ScoopPoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
}): {
  commands: Hex;
  inputs: Hex[];
  deadline: bigint;
  /** msg.value for native settle; 0 otherwise. */
  value: bigint;
  settleCurrency: `0x${string}`;
  takeCurrency: `0x${string}`;
} {
  const { settle, take } = settleTakeCurrencies({
    poolKey: args.poolKey,
    zeroForOne: args.zeroForOne,
  });
  const input = encodeV4ExactInSingleInput(args);
  const commands = encodePacked(['uint8'], [UR_CMD_V4_SWAP]);
  const value = settle === '0x0000000000000000000000000000000000000000' ? args.amountIn : BigInt(0);
  return {
    commands,
    inputs: [input],
    deadline: args.deadline,
    value,
    settleCurrency: settle,
    takeCurrency: take,
  };
}
