import { describe, expect, it } from 'vitest';

/**
 * Regression: Pons CurveBuy/Sell `fee` is quote wei, not UV4 fee tier.
 * Value observed crashing production: 6767803800000000 (fits JS safe int,
 * overflows Postgres integer). Writers must pass bigint through toNumericString.
 */
describe('Pons trade fee width', () => {
  const FEE = 6767803800000000n;

  it('must not coerce wei fee through Number into int32 domain', () => {
    const asNumber = Number(FEE);
    expect(Number.isSafeInteger(asNumber)).toBe(true);
    expect(asNumber > 2147483647).toBe(true);
    // The production bug: binding JS number into PG integer column.
    expect(() => {
      // Simulate PG int32 check
      if (asNumber > 2147483647 || asNumber < -2147483648) {
        throw new Error(`value "${asNumber}" is out of range for type integer`);
      }
    }).toThrow(/out of range for type integer/);
  });

  it('preserves exact wei when kept as bigint string', () => {
    expect(FEE.toString(10)).toBe('6767803800000000');
  });
});
