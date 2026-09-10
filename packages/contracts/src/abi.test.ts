/**
 * Focused ABI / constant alignment tests (companion to manifest.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_FEE_STEP,
  BASE_FEE,
  MAX_ADDITIONAL_FEE,
  assertValidAdditionalFee,
  percentToFeeUnits,
  scoopAbis,
  totalPoolFee,
} from '../src/index.js';

describe('@scoop/contracts fee helpers', () => {
  it('rejects invalid additional fees', () => {
    expect(() => assertValidAdditionalFee(500)).toThrow(/multiple/);
    expect(() => assertValidAdditionalFee(21_000)).toThrow(/outside/);
    expect(() => totalPoolFee(ADDITIONAL_FEE_STEP)).not.toThrow();
    expect(percentToFeeUnits(1)).toBe(BASE_FEE);
    expect(percentToFeeUnits(0.1)).toBe(ADDITIONAL_FEE_STEP);
    expect(percentToFeeUnits(2)).toBe(MAX_ADDITIONAL_FEE);
  });
});

describe('@scoop/contracts TokenLaunched shape', () => {
  it('canonical TokenLaunched includes holderRewards + fee routing', () => {
    const event = (
      scoopAbis.ScoopFactory as Array<{
        type?: string;
        name?: string;
        inputs?: Array<{ name: string }>;
      }>
    ).find((x) => x.type === 'event' && x.name === 'TokenLaunched');
    const names = event?.inputs?.map((i) => i.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining([
        'holderRewards',
        'additionalFee',
        'totalPoolFee',
        'creatorAllocationDestination',
        'additionalFeeDestination',
      ]),
    );
  });
});
