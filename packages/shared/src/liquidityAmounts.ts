import { mulDiv, Q96 } from './fixedPoint.js';

/**
 * Uniswap LiquidityAmounts — amount0/amount1 for a liquidity position (bigint).
 * Port of LiquidityAmounts.sol getAmount{0,1}ForLiquidity / getAmountsForLiquidity.
 */

function sortSqrt(a: bigint, b: bigint): [bigint, bigint] {
  return a > b ? [b, a] : [a, b];
}

/** amount0 = liquidity * (sqrtUpper - sqrtLower) / sqrtUpper / sqrtLower  (via Q96 shift) */
export function getAmount0ForLiquidity(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): bigint {
  const [sqrtA, sqrtB] = sortSqrt(sqrtRatioAX96, sqrtRatioBX96);
  if (sqrtA <= 0n) throw new Error('getAmount0ForLiquidity: sqrtA must be positive');
  // FullMath.mulDiv(liquidity << 96, sqrtB - sqrtA, sqrtB) / sqrtA
  const intermediate = mulDiv(liquidity << 96n, sqrtB - sqrtA, sqrtB);
  return intermediate / sqrtA;
}

/** amount1 = liquidity * (sqrtUpper - sqrtLower) / Q96 */
export function getAmount1ForLiquidity(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): bigint {
  const [sqrtA, sqrtB] = sortSqrt(sqrtRatioAX96, sqrtRatioBX96);
  return mulDiv(liquidity, sqrtB - sqrtA, Q96);
}

/**
 * Token amounts for liquidity given current price and range.
 * Below range → all token0; above range → all token1; in range → both.
 */
export function getAmountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  const [sqrtA, sqrtB] = sortSqrt(sqrtRatioAX96, sqrtRatioBX96);

  if (sqrtRatioX96 <= sqrtA) {
    return {
      amount0: getAmount0ForLiquidity(sqrtA, sqrtB, liquidity),
      amount1: 0n,
    };
  }
  if (sqrtRatioX96 < sqrtB) {
    return {
      amount0: getAmount0ForLiquidity(sqrtRatioX96, sqrtB, liquidity),
      amount1: getAmount1ForLiquidity(sqrtA, sqrtRatioX96, liquidity),
    };
  }
  return {
    amount0: 0n,
    amount1: getAmount1ForLiquidity(sqrtA, sqrtB, liquidity),
  };
}
