import { describe, expect, it } from 'vitest';
import {
  isCanonicalDistributionArgs,
  normalizeFeeDistributionArgs,
} from './feeDistribution.js';
import { extractLaunchEconomics } from './launchEconomics.js';
import type { DecodedChainEvent } from '../decode.js';

describe('normalizeFeeDistributionArgs', () => {
  it('maps historical canary legs to base-only aggregates', () => {
    const legs = normalizeFeeDistributionArgs({
      totalAmount: 1000n,
      creatorRewardsAmount: 700n,
      deployerAmount: 40n,
      buybackAmount: 200n,
      operationsAmount: 60n,
    });
    expect(isCanonicalDistributionArgs({
      totalAmount: 1000n,
      creatorRewardsAmount: 700n,
    })).toBe(false);
    expect(legs.baseCreatorRaw).toBe(700n);
    expect(legs.baseDeployerRaw).toBe(40n);
    expect(legs.baseProtocolRaw).toBe(200n);
    expect(legs.baseOperationsRaw).toBe(60n);
    expect(legs.baseHoldersRaw).toBe(0n);
    expect(legs.extraCreatorRaw + legs.extraDeployerRaw + legs.extraHoldersRaw).toBe(0n);
    expect(legs.creatorRaw).toBe(700n);
    expect(legs.deployerRaw).toBe(40n);
    expect(legs.holdersRaw).toBe(0n);
    expect(
      legs.baseCreatorRaw +
        legs.baseHoldersRaw +
        legs.baseDeployerRaw +
        legs.baseProtocolRaw +
        legs.baseOperationsRaw +
        legs.extraCreatorRaw +
        legs.extraDeployerRaw +
        legs.extraHoldersRaw,
    ).toBe(legs.totalRaw);
  });

  it('maps canonical base/extra legs with conservation', () => {
    const legs = normalizeFeeDistributionArgs({
      totalAmount: 3000n,
      basePart: 2000n,
      extraPart: 1000n,
      baseCreatorAmount: 1400n,
      baseHoldersAmount: 0n,
      baseDeployerAmount: 80n,
      baseBuybackAmount: 400n,
      baseOperationsAmount: 120n,
      extraCreatorAmount: 0n,
      extraDeployerAmount: 1000n,
      extraHoldersAmount: 0n,
    });
    expect(isCanonicalDistributionArgs({
      baseCreatorAmount: 1n,
    })).toBe(true);
    expect(legs.creatorRaw).toBe(1400n);
    expect(legs.deployerRaw).toBe(1080n);
    expect(legs.buybackRaw).toBe(400n);
    expect(legs.operationsRaw).toBe(120n);
    expect(legs.holdersRaw).toBe(0n);
    expect(
      legs.baseCreatorRaw +
        legs.baseHoldersRaw +
        legs.baseDeployerRaw +
        legs.baseProtocolRaw +
        legs.baseOperationsRaw +
        legs.extraCreatorRaw +
        legs.extraDeployerRaw +
        legs.extraHoldersRaw,
    ).toBe(3000n);
  });
});

describe('extractLaunchEconomics', () => {
  const cases: Array<{
    name: string;
    additionalFee: number;
    totalPoolFee: number;
    creatorAlloc: 0 | 1;
    additionalDest: 0 | 1 | 2;
  }> = [
    { name: '0 extra, base→Creator', additionalFee: 0, totalPoolFee: 10000, creatorAlloc: 0, additionalDest: 0 },
    { name: '0 extra, base→Holders', additionalFee: 0, totalPoolFee: 10000, creatorAlloc: 1, additionalDest: 0 },
    { name: '1% extra→Creator', additionalFee: 10000, totalPoolFee: 20000, creatorAlloc: 0, additionalDest: 0 },
    { name: '1% extra→Deployer', additionalFee: 10000, totalPoolFee: 20000, creatorAlloc: 0, additionalDest: 1 },
    { name: '2% extra→Holders', additionalFee: 20000, totalPoolFee: 30000, creatorAlloc: 0, additionalDest: 2 },
    { name: 'base→Holders + extra→Holders', additionalFee: 10000, totalPoolFee: 20000, creatorAlloc: 1, additionalDest: 2 },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const vault = '0x1111111111111111111111111111111111111111';
      const decoded: DecodedChainEvent[] = [
        {
          kind: 'TokenLaunched',
          address: '0xfactory',
          logIndex: 1,
          args: {
            token: '0x2222222222222222222222222222222222222222',
            holderRewards: vault,
            additionalFee: c.additionalFee,
            totalPoolFee: c.totalPoolFee,
            creatorAllocationDestination: c.creatorAlloc,
            additionalFeeDestination: c.additionalDest,
          },
        },
      ];
      const econ = extractLaunchEconomics(decoded);
      expect(econ.additionalFee).toBe(c.additionalFee);
      expect(econ.totalPoolFee).toBe(c.totalPoolFee);
      expect(econ.creatorAllocationDestination).toBe(c.creatorAlloc);
      expect(econ.additionalFeeDestination).toBe(c.additionalDest);
      expect(econ.holderRewardsAddress).toBe(vault);
    });
  }

  it('historical TokenLaunched defaults to BASE_FEE and null vault', () => {
    const econ = extractLaunchEconomics([
      {
        kind: 'TokenLaunched',
        address: '0xfactory',
        logIndex: 1,
        args: {
          token: '0x2222222222222222222222222222222222222222',
          feeDistributor: '0x3333333333333333333333333333333333333333',
          liquidityLocker: '0x4444444444444444444444444444444444444444',
        },
      },
    ]);
    expect(econ.additionalFee).toBe(0);
    expect(econ.totalPoolFee).toBe(10000);
    expect(econ.holderRewardsAddress).toBeNull();
  });
});
