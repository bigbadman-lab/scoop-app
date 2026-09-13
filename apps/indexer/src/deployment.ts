/**
 * Fail-closed operational deployment identity for the live indexer.
 * Always canonical production — never falls back to the HELLO/canary stack.
 */
import {
  CANONICAL_CHAIN_ID,
  HISTORICAL_TEST_FACTORY_ADDRESS,
  canonicalProductionManifest,
  isCanonicalProductionDeployed,
  requireCanonicalProductionAddresses,
} from '@scoop/contracts';
import { normalizeAddress } from '@scoop/shared';

export type IndexerCanonicalDeployment = {
  deploymentKind: 'canonical-production';
  status: 'deployed';
  chainId: typeof CANONICAL_CHAIN_ID;
  factory: string;
  creatorRewards: string;
  priceOracle: string;
  poolManager: string;
  positionManager: string;
  universalRouter: string;
  permit2: string;
  indexingStartBlock: number;
};

/**
 * Resolve canonical production addresses + indexing start block for live indexer ops.
 * Throws if undeployed, missing start block, or Factory equals the historical canary.
 */
export function requireIndexerCanonicalDeployment(): IndexerCanonicalDeployment {
  if (!isCanonicalProductionDeployed(canonicalProductionManifest)) {
    throw new Error(
      'Canonical production is undeployed; refusing historical canary as indexer operational deployment',
    );
  }

  const addresses = requireCanonicalProductionAddresses(canonicalProductionManifest);
  const factory = normalizeAddress(addresses.factory);
  if (factory === HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase()) {
    throw new Error(
      'Refusing historical test Factory as indexer operational Factory',
    );
  }

  const indexingStartBlock =
    canonicalProductionManifest.metadata.indexingStartBlock;
  if (
    indexingStartBlock == null ||
    !Number.isInteger(indexingStartBlock) ||
    indexingStartBlock <= 0
  ) {
    throw new Error(
      'Canonical production metadata.indexingStartBlock must be a positive integer',
    );
  }

  if (canonicalProductionManifest.chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(
      `Canonical production chainId must be ${CANONICAL_CHAIN_ID}`,
    );
  }

  return {
    deploymentKind: 'canonical-production',
    status: 'deployed',
    chainId: CANONICAL_CHAIN_ID,
    factory,
    creatorRewards: normalizeAddress(addresses.creatorRewards),
    priceOracle: normalizeAddress(addresses.priceOracle),
    poolManager: normalizeAddress(addresses.poolManager),
    positionManager: normalizeAddress(addresses.positionManager),
    universalRouter: normalizeAddress(addresses.universalRouter),
    permit2: normalizeAddress(addresses.permit2),
    indexingStartBlock,
  };
}

/** Canonical indexing start block from the production manifest (fail-closed). */
export function requireCanonicalIndexingStartBlock(): number {
  return requireIndexerCanonicalDeployment().indexingStartBlock;
}
