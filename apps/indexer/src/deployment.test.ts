import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_TEST_FACTORY_ADDRESS,
  canonicalProductionManifest,
} from '@scoop/contracts';
import {
  requireCanonicalIndexingStartBlock,
  requireIndexerCanonicalDeployment,
} from './deployment.js';

describe('indexer canonical deployment resolver', () => {
  it('returns P10.3 Factory / CreatorRewards / PriceOracle / PoolManager', () => {
    const d = requireIndexerCanonicalDeployment();
    expect(d.deploymentKind).toBe('canonical-production');
    expect(d.status).toBe('deployed');
    expect(d.chainId).toBe(4663);
    expect(d.factory).toBe('0x4b227d5e6199f42cea4e638875ff8c740757dd3c');
    expect(d.creatorRewards).toBe(
      '0xdb80eed1d52c8c80ae3e221c85da94319132f6ef',
    );
    expect(d.priceOracle).toBe('0x346a84fbab49a50a2255f2808fd6bce812dafe5c');
    expect(d.poolManager).toBe('0x8366a39cc670b4001a1121b8f6a443a643e40951');
    expect(d.positionManager).toBe(
      '0x58daec3116aae6d93017baaea7749052e8a04fa7',
    );
    expect(d.universalRouter).toBe(
      '0x8876789976decbfcbbbe364623c63652db8c0904',
    );
    expect(d.indexingStartBlock).toBe(60525572);
    expect(d.factory).not.toBe(HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase());
  });

  it('start block helper matches manifest metadata', () => {
    expect(requireCanonicalIndexingStartBlock()).toBe(60525572);
    expect(canonicalProductionManifest.metadata.indexingStartBlock).toBe(
      60525572,
    );
  });
});
