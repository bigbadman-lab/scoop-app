/** Uniswap X96 fixed-point helpers — bigint only. */

export const Q96 = 2n ** 96n;

/** Floor(a * b / denom) with bigint — never Number(). */
export function mulDiv(a: bigint, b: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new Error('mulDiv: division by zero');
  return (a * b) / denom;
}
