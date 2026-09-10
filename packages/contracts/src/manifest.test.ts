import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_FEE_STEP,
  BASE_FEE,
  CANONICAL_ADDRESS_KEYS,
  CANONICAL_CHAIN_ID,
  CANONICAL_PROTOCOL_COMMIT,
  CreatorAllocationDestination,
  AdditionalFeeDestination,
  HISTORICAL_TEST_FACTORY_ADDRESS,
  LP_FEE,
  MAX_ADDITIONAL_FEE,
  MAX_TOTAL_FEE,
  TICK_SPACING,
  canonicalProductionManifest,
  feeUnitsToPercent,
  historicalTestCanaryManifest,
  isCanonicalProductionDeployed,
  requireCanonicalProductionAddresses,
  scoopAbis,
  scoopV1MainnetCanaryManifest,
  totalPoolFee,
  validateCanonicalProductionManifest,
  validateHistoricalTestManifest,
  validateManifest,
} from '../src/index.js';

describe('@scoop/contracts manifest', () => {
  it('uses chain ID 4663', () => {
    expect(historicalTestCanaryManifest.chainId).toBe(4663);
    expect(canonicalProductionManifest.chainId).toBe(4663);
    expect(CANONICAL_CHAIN_ID).toBe(4663);
  });

  it('labels historical canary as historical-test-only', () => {
    expect(historicalTestCanaryManifest.deploymentKind).toBe(
      'historical-test-only',
    );
    expect(historicalTestCanaryManifest.contracts.ScoopFactory).toBe(
      HISTORICAL_TEST_FACTORY_ADDRESS,
    );
    expect(scoopV1MainnetCanaryManifest).toBe(historicalTestCanaryManifest);
  });

  it('matches HELLO golden fixture on historical canary', () => {
    expect(historicalTestCanaryManifest.fixtures.hello.token).toBe(
      '0x2284ed0e4d446c6D78aC2d49a68BAE822Fd87373',
    );
    expect(historicalTestCanaryManifest.fixtures.hello.poolId).toBe(
      '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
    );
    expect(historicalTestCanaryManifest.fixtures.hello.launchBlock).toBe(
      55863290,
    );
  });

  it('represents canonical production as undeployed with rootPublisher in schema', () => {
    expect(canonicalProductionManifest.deploymentKind).toBe(
      'canonical-production',
    );
    expect(canonicalProductionManifest.status).toBe('undeployed');
    expect(canonicalProductionManifest.contracts).toBeNull();
    expect(canonicalProductionManifest.source.commit).toBe(
      CANONICAL_PROTOCOL_COMMIT,
    );
    expect(CANONICAL_ADDRESS_KEYS).toContain('rootPublisher');
    expect(isCanonicalProductionDeployed()).toBe(false);
  });

  it('rejects treating historical Factory as canonical production', () => {
    expect(() => requireCanonicalProductionAddresses()).toThrow(
      /not yet deployed/,
    );

    const fakeDeployed = {
      ...canonicalProductionManifest,
      status: 'deployed' as const,
      contracts: Object.fromEntries(
        CANONICAL_ADDRESS_KEYS.map((key) => [
          key,
          HISTORICAL_TEST_FACTORY_ADDRESS,
        ]),
      ) as never,
      fixtures: { hello: null },
      metadata: {
        description: 'fake',
        indexingStartBlock: null,
      },
    };

    expect(() => validateCanonicalProductionManifest(fakeDeployed)).toThrow(
      /must not equal the historical test Factory/,
    );
  });

  it('rejects wrong chain ID on historical manifest', () => {
    expect(() =>
      validateManifest({
        ...historicalTestCanaryManifest,
        chainId: 1,
      }),
    ).toThrow(/chainId/);
  });

  it('rejects wrong deploymentKind on historical validator', () => {
    expect(() =>
      validateHistoricalTestManifest({
        ...historicalTestCanaryManifest,
        deploymentKind: 'canonical-production',
      }),
    ).toThrow(/deploymentKind/);
  });
});

describe('@scoop/contracts fees + enums', () => {
  it('matches Solidity fee constants', () => {
    expect(BASE_FEE).toBe(10_000);
    expect(LP_FEE).toBe(BASE_FEE);
    expect(ADDITIONAL_FEE_STEP).toBe(1_000);
    expect(MAX_ADDITIONAL_FEE).toBe(20_000);
    expect(MAX_TOTAL_FEE).toBe(30_000);
    expect(TICK_SPACING).toBe(10);
    expect(feeUnitsToPercent(BASE_FEE)).toBe(1);
    expect(feeUnitsToPercent(ADDITIONAL_FEE_STEP)).toBe(0.1);
    expect(totalPoolFee(0)).toBe(10_000);
    expect(totalPoolFee(20_000)).toBe(30_000);
  });

  it('matches ScoopFeeTypes enum ordinals', () => {
    expect(CreatorAllocationDestination.Creator).toBe(0);
    expect(CreatorAllocationDestination.Holders).toBe(1);
    expect(AdditionalFeeDestination.Creator).toBe(0);
    expect(AdditionalFeeDestination.Deployer).toBe(1);
    expect(AdditionalFeeDestination.Holders).toBe(2);
  });
});

describe('@scoop/contracts ABIs', () => {
  function findLaunchParamsComponents(abi: readonly unknown[]) {
    const launch = (abi as Array<{ name?: string; inputs?: unknown[] }>).find(
      (x) => x.name === 'launch',
    );
    const params = launch?.inputs?.[0] as {
      components?: Array<{ name: string }>;
    };
    return params?.components?.map((c) => c.name) ?? [];
  }

  function hasEvent(abi: readonly unknown[], name: string): boolean {
    return (abi as Array<{ type?: string; name?: string }>).some(
      (x) => x.type === 'event' && x.name === name,
    );
  }

  function hasFn(abi: readonly unknown[], name: string): boolean {
    return (abi as Array<{ type?: string; name?: string }>).some(
      (x) => x.type === 'function' && x.name === name,
    );
  }

  it('Factory ABI LaunchParams includes fee routing fields', () => {
    const names = findLaunchParamsComponents(scoopAbis.ScoopFactory);
    expect(names).toEqual(
      expect.arrayContaining([
        'additionalFee',
        'creatorAllocationDestination',
        'additionalFeeDestination',
      ]),
    );
  });

  it('Factory ABI includes launch economics events', () => {
    expect(hasEvent(scoopAbis.ScoopFactory, 'TokenLaunched')).toBe(true);
    expect(hasEvent(scoopAbis.ScoopFactory, 'LaunchEconomicsConfigured')).toBe(
      true,
    );
  });

  it('HolderRewards ABI exports required surface', () => {
    const abi = scoopAbis.ScoopHolderRewards;
    for (const name of [
      'feeDistributor',
      'rootPublisher',
      'uncommitted',
      'outstandingCommitted',
      'totalDeposited',
      'totalPaid',
      'round',
      'isPaid',
      'leafHash',
      'publishRound',
      'pushBatch',
      'claim',
    ]) {
      expect(hasFn(abi, name)).toBe(true);
    }
    for (const name of [
      'HolderRewardDeposited',
      'HolderRewardRoundPublished',
      'HolderRewardPushed',
      'HolderRewardClaimed',
      'HolderRewardPushFailed',
      'FeeDistributorInitialized',
    ]) {
      expect(hasEvent(abi, name)).toBe(true);
    }
  });

  it('FeeDistributor ABI includes distribution breakdown events', () => {
    expect(hasEvent(scoopAbis.ScoopFeeDistributor, 'ETHDistributed')).toBe(true);
    expect(hasEvent(scoopAbis.ScoopFeeDistributor, 'TokenDistributed')).toBe(
      true,
    );
  });

  it('CreatorRewards preserves claim/credit events', () => {
    for (const name of [
      'ETHCredited',
      'TokenCredited',
      'ETHClaimed',
      'TokenClaimed',
    ]) {
      expect(hasEvent(scoopAbis.ScoopCreatorRewards, name)).toBe(true);
    }
  });

  it('does not export ScoopHolderRewardsReceiver', () => {
    expect(
      Object.keys(scoopAbis).some((k) =>
        k.toLowerCase().includes('holderrewardsreceiver'),
      ),
    ).toBe(false);
  });

  it('keeps historical canary Factory ABI for HELLO decode', () => {
    const hist = findLaunchParamsComponents(
      scoopAbis.ScoopFactoryHistoricalCanary,
    );
    expect(hist).not.toContain('additionalFee');
    expect(hasEvent(scoopAbis.ScoopFactoryHistoricalCanary, 'TokenLaunched')).toBe(
      true,
    );
  });
});
