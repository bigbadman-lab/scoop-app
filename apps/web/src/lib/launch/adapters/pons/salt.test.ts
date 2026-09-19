import { describe, expect, it } from 'vitest';
import { generatePonsSalt, isValidPonsSalt, resolvePonsSalt } from './salt';
import { buildPonsTokenParams } from './build-params';
import type { PonsLaunchAdapterInput, PonsPreflightResult } from './types';
import { PonsAdapterError } from './errors';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;

function baseInput(over?: Partial<PonsLaunchAdapterInput>): PonsLaunchAdapterInput {
  return {
    creator,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://logo',
    description: 'desc',
    creatorTaxBps: 0,
    buybackEnabled: true,
    quoteInWei: BigInt(10) ** BigInt(16),
    slippageBps: 100,
    ...over,
  };
}

const preflight = {
  expectedEconomics:
    '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7' as const,
} as Pick<PonsPreflightResult, 'expectedEconomics'>;

describe('pons salt', () => {
  it('generates valid bytes32', () => {
    const salt = generatePonsSalt();
    expect(isValidPonsSalt(salt)).toBe(true);
    expect(salt).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('preserves caller-supplied salt', () => {
    const existing =
      '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
    expect(resolvePonsSalt(existing)).toBe(existing);
  });

  it('rejects invalid supplied salt', () => {
    expect(() => resolvePonsSalt('0x1234')).toThrow(PonsAdapterError);
  });

  it('retries with same salt build identical TokenParams salt', () => {
    const salt =
      '0x2222222222222222222222222222222222222222222222222222222222222222' as const;
    const a = buildPonsTokenParams({
      input: baseInput({ salt }),
      preflight,
      salt,
    });
    const b = buildPonsTokenParams({
      input: baseInput({ salt }),
      preflight,
      salt,
    });
    expect(a.salt).toBe(salt);
    expect(b.salt).toBe(salt);
    expect(a).toEqual(b);
  });
});
