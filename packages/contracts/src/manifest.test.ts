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

  it('represents canonical production as deployed P10.3 stack', () => {
    expect(canonicalProductionManifest.deploymentKind).toBe(
      'canonical-production',
    );
    expect(canonicalProductionManifest.status).toBe('deployed');
    expect(canonicalProductionManifest.source.commit).toBe(
      CANONICAL_PROTOCOL_COMMIT,
    );
    expect(isCanonicalProductionDeployed()).toBe(true);
    expect(canonicalProductionManifest.metadata.indexingStartBlock).toBe(
      60525572,
    );
    expect(canonicalProductionManifest.fixtures).toEqual({ hello: null });

    const addresses = requireCanonicalProductionAddresses();
    expect(CANONICAL_ADDRESS_KEYS).toHaveLength(18);
    for (const key of CANONICAL_ADDRESS_KEYS) {
      expect(addresses[key]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }

    expect(addresses.factory).toBe(
      '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C',
    );
    expect(addresses.factory.toLowerCase()).not.toBe(
      HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase(),
    );
    expect(addresses.creatorRegistry).toBe(
      '0xC99ec41AAe874B02D6e7392B43b713B6dD2E03C2',
    );
    expect(addresses.creatorRewards).toBe(
      '0xdB80eED1d52c8c80Ae3E221C85dA94319132f6EF',
    );
    expect(addresses.tokenDeployer).toBe(
      '0x259D3f3474fD192174BC245feb6d676CC4Fe4379',
    );
    expect(addresses.launchDeployer).toBe(
      '0x3f6dF184ff86F32bf431c7Aff5267d1C899DAcBd',
    );
    expect(addresses.quoteRegistry).toBe(
      '0xE3782bef83cfB17B5a84B2649405a944dc58e40C',
    );
    expect(addresses.priceOracle).toBe(
      '0x346a84fbAB49a50a2255F2808fd6BCe812DaFe5c',
    );
    expect(addresses.rootPublisher).toBe(
      '0xe37C1c028201054461d0F283896B56552b054B29',
    );
    expect(addresses.poolManager).toBe(
      '0x8366a39CC670B4001A1121B8F6A443A643e40951',
    );
    expect(addresses.positionManager).toBe(
      '0x58daec3116aae6D93017bAAea7749052E8a04fA7',
    );
    expect(addresses.universalRouter).toBe(
      '0x8876789976dEcBfCbBbe364623C63652db8C0904',
    );
    expect(addresses.permit2).toBe(
      '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    );
    expect(addresses.launchFeeRecipient).toBe(
      '0xCb2D4ceD82B5E9e013F4db58F999662052aE1FA3',
    );
    expect(addresses.buybackVault).toBe(
      '0x4DD3fe45AD34A0De7182f51822246A2E4379bA15',
    );
    expect(addresses.operations).toBe(
      '0x17CD9659e8cB03c49F9C631218f57d65089d7C95',
    );
    expect(addresses.verificationAuthority).toBe(
      '0xe176aCa5227F4c59c843cD0f2BAef21924DbfFE8',
    );
    expect(addresses.registryAuthority).toBe(
      '0x54dCe3F53bbe3fBa3d1035E045a8a4de850eDcE7',
    );
    expect(addresses.oracleAuthority).toBe(
      '0x54dCe3F53bbe3fBa3d1035E045a8a4de850eDcE7',
    );
  });

  it('rejects treating historical Factory as canonical production', () => {
    const fakeDeployed = {
      protocol: 'SCOOP' as const,
      deploymentKind: 'canonical-production' as const,
      status: 'deployed' as const,
      chainId: CANONICAL_CHAIN_ID,
      baseline: 'fake',
      source: {
        repo: 'scoop-protocol' as const,
        tag: 'p3-canonical' as const,
        commit: CANONICAL_PROTOCOL_COMMIT,
      },
      contracts: Object.fromEntries(
        CANONICAL_ADDRESS_KEYS.map((key) => [
          key,
          HISTORICAL_TEST_FACTORY_ADDRESS,
        ]),
      ) as never,
      fixtures: { hello: null },
      metadata: {
        description: 'fake',
        indexingStartBlock: 60525572,
      },
    };

    expect(() => validateCanonicalProductionManifest(fakeDeployed)).toThrow(
      /must not equal the historical test Factory/,
    );
  });

  it('keeps historical canary Factory distinct from canonical production', () => {
    expect(historicalTestCanaryManifest.deploymentKind).toBe(
      'historical-test-only',
    );
    expect(historicalTestCanaryManifest.contracts.ScoopFactory).toBe(
      HISTORICAL_TEST_FACTORY_ADDRESS,
    );
    expect(
      requireCanonicalProductionAddresses().factory.toLowerCase(),
    ).not.toBe(HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase());
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
