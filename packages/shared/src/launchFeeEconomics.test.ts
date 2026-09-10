import { describe, expect, it } from 'vitest';
import {
  AdditionalFeeDestination,
  additionalFeePercentToUnits,
  BASE_FEE,
  computeEffectiveFeeRouting,
  CreatorAllocationDestination,
  formatTradingFeePercent,
  validateAdditionalFeeUnits,
} from './launchFeeEconomics.js';

describe('additional fee input', () => {
  it.each([
    [0, 0],
    [0.1, 1_000],
    [1, 10_000],
    [2, 20_000],
  ])('%s%% → %s units', (percent, units) => {
    const r = additionalFeePercentToUnits(percent);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.additionalFee).toBe(units);
    expect(validateAdditionalFeeUnits(units).ok).toBe(true);
  });

  it.each([-0.1, 0.08, 0.25, 2.1])('rejects %s%%', (percent) => {
    expect(additionalFeePercentToUnits(percent).ok).toBe(false);
  });
});

describe('effective fee routing', () => {
  const cases: Array<{
    name: string;
    creator: typeof CreatorAllocationDestination.Creator | typeof CreatorAllocationDestination.Holders;
    additional: number;
    dest: typeof AdditionalFeeDestination.Creator | typeof AdditionalFeeDestination.Deployer | typeof AdditionalFeeDestination.Holders;
    expect: {
      creator: number;
      holders: number;
      deployer: number;
      protocol: number;
      operations: number;
      total: number;
    };
  }> = [
    {
      name: 'base Creator + 0',
      creator: CreatorAllocationDestination.Creator,
      additional: 0,
      dest: AdditionalFeeDestination.Creator,
      expect: {
        creator: 7_000,
        holders: 0,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 10_000,
      },
    },
    {
      name: 'base Holders + 0',
      creator: CreatorAllocationDestination.Holders,
      additional: 0,
      dest: AdditionalFeeDestination.Creator,
      expect: {
        creator: 0,
        holders: 7_000,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 10_000,
      },
    },
    {
      name: 'base Creator + 1% Creator',
      creator: CreatorAllocationDestination.Creator,
      additional: 10_000,
      dest: AdditionalFeeDestination.Creator,
      expect: {
        creator: 17_000,
        holders: 0,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 20_000,
      },
    },
    {
      name: 'base Creator + 1% Deployer',
      creator: CreatorAllocationDestination.Creator,
      additional: 10_000,
      dest: AdditionalFeeDestination.Deployer,
      expect: {
        creator: 7_000,
        holders: 0,
        deployer: 10_400,
        protocol: 2_000,
        operations: 600,
        total: 20_000,
      },
    },
    {
      name: 'base Creator + 1% Holders',
      creator: CreatorAllocationDestination.Creator,
      additional: 10_000,
      dest: AdditionalFeeDestination.Holders,
      expect: {
        creator: 7_000,
        holders: 10_000,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 20_000,
      },
    },
    {
      name: 'base Holders + 2% Holders',
      creator: CreatorAllocationDestination.Holders,
      additional: 20_000,
      dest: AdditionalFeeDestination.Holders,
      expect: {
        creator: 0,
        holders: 27_000,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 30_000,
      },
    },
    {
      name: 'base Holders + 2% Creator',
      creator: CreatorAllocationDestination.Holders,
      additional: 20_000,
      dest: AdditionalFeeDestination.Creator,
      expect: {
        creator: 20_000,
        holders: 7_000,
        deployer: 400,
        protocol: 2_000,
        operations: 600,
        total: 30_000,
      },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = computeEffectiveFeeRouting({
        creatorAllocationDestination: c.creator,
        additionalFee: c.additional,
        additionalFeeDestination: c.dest,
      });
      expect(r.creatorUnits).toBe(c.expect.creator);
      expect(r.holdersUnits).toBe(c.expect.holders);
      expect(r.deployerUnits).toBe(c.expect.deployer);
      expect(r.protocolUnits).toBe(c.expect.protocol);
      expect(r.operationsUnits).toBe(c.expect.operations);
      expect(r.totalFeeUnits).toBe(c.expect.total);
      expect(r.totalFeeUnits).toBe(BASE_FEE + c.additional);
      expect(
        r.creatorUnits +
          r.holdersUnits +
          r.deployerUnits +
          r.protocolUnits +
          r.operationsUnits,
      ).toBe(r.totalFeeUnits);
    });
  }

  it('formats display percents', () => {
    expect(formatTradingFeePercent(7_000)).toBe('0.70%');
    expect(formatTradingFeePercent(10_000)).toBe('1.00%');
    expect(formatTradingFeePercent(27_000)).toBe('2.70%');
  });
});
