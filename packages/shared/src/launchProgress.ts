import { getAmountsForLiquidity } from './liquidityAmounts.js';

export const DEFAULT_LAUNCH_DUST_RAW = 1000n;

/**
 * Token inventory remaining in the initial LP position at `sqrtPriceX96`.
 * HELLO / ETH-quote launches use tokenIsCurrency1=true.
 */
export function amountTokenInPosition(args: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  sqrtLower: bigint;
  sqrtUpper: bigint;
  tokenIsCurrency1: boolean;
}): bigint {
  const { amount0, amount1 } = getAmountsForLiquidity(
    args.sqrtPriceX96,
    args.sqrtLower,
    args.sqrtUpper,
    args.liquidity,
  );
  return args.tokenIsCurrency1 ? amount1 : amount0;
}

/**
 * Launch progress in basis points: 0..10000.
 * progress = (initial - current) / initial when initial > 0.
 * If current > initial (reorg/noise), clamps to 0.
 */
export function launchProgressBps(args: {
  initialTokenInventory: bigint;
  currentTokenInventory: bigint;
}): number {
  const { initialTokenInventory, currentTokenInventory } = args;
  if (initialTokenInventory <= 0n) return 0;
  if (currentTokenInventory >= initialTokenInventory) return 0;
  const sold = initialTokenInventory - currentTokenInventory;
  const bps = (sold * 10000n) / initialTokenInventory;
  if (bps >= 10000n) return 10000;
  if (bps <= 0n) return 0;
  return Number(bps);
}

export function isLaunchComplete(args: {
  progressBps: number;
  currentTokenInventory: bigint;
  dustRaw?: bigint;
}): boolean {
  const dust = args.dustRaw ?? DEFAULT_LAUNCH_DUST_RAW;
  return args.progressBps >= 10000 || args.currentTokenInventory <= dust;
}

/**
 * Full progress snapshot from position state.
 * Below/above range handled naturally by getAmountsForLiquidity.
 */
export function computeLaunchProgress(args: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  sqrtLower: bigint;
  sqrtUpper: bigint;
  tokenIsCurrency1: boolean;
  /** Opening inventory; when omitted, computed at openingSqrtPriceX96 or at lower/upper edge. */
  initialTokenInventory?: bigint;
  openingSqrtPriceX96?: bigint;
  dustRaw?: bigint;
}): {
  initialTokenInventory: bigint;
  currentTokenInventory: bigint;
  progressBps: number;
  complete: boolean;
} {
  const dustRaw = args.dustRaw ?? DEFAULT_LAUNCH_DUST_RAW;

  const initialTokenInventory =
    args.initialTokenInventory ??
    amountTokenInPosition({
      liquidity: args.liquidity,
      sqrtPriceX96: args.openingSqrtPriceX96 ?? args.sqrtPriceX96,
      sqrtLower: args.sqrtLower,
      sqrtUpper: args.sqrtUpper,
      tokenIsCurrency1: args.tokenIsCurrency1,
    });

  const currentTokenInventory = amountTokenInPosition({
    liquidity: args.liquidity,
    sqrtPriceX96: args.sqrtPriceX96,
    sqrtLower: args.sqrtLower,
    sqrtUpper: args.sqrtUpper,
    tokenIsCurrency1: args.tokenIsCurrency1,
  });

  const progressBps = launchProgressBps({
    initialTokenInventory,
    currentTokenInventory,
  });

  return {
    initialTokenInventory,
    currentTokenInventory,
    progressBps,
    complete: isLaunchComplete({ progressBps, currentTokenInventory, dustRaw }),
  };
}
