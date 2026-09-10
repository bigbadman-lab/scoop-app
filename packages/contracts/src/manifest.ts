import rawCanonicalProduction from './manifests/canonical-production.json' with {
  type: 'json',
};
import rawHistoricalCanary from './manifests/historical/scoop-v1-mainnet-canary.json' with {
  type: 'json',
};

/** Robinhood Chain — unchanged. */
export const CANONICAL_CHAIN_ID = 4663 as const;

/**
 * ABI / protocol source of truth for the contracts package (P3 freeze).
 * Not a deployed production address set.
 */
export const CANONICAL_PROTOCOL_TAG = 'p3-canonical' as const;
export const CANONICAL_PROTOCOL_COMMIT =
  '0157a9b47a7ad44e48b8671e58eca1e16227f34b' as const;

/** Historical HELLO canary provenance (pre-P3 test stack). */
export const HISTORICAL_CANARY_PROTOCOL_TAG = 'scoop-v1-mainnet-canary' as const;
export const HISTORICAL_CANARY_PROTOCOL_COMMIT =
  'c8268c0a97274cb751f4077d0e28450caf276357' as const;

/** Explicit historical Factory — never treated as canonical production. */
export const HISTORICAL_TEST_FACTORY_ADDRESS =
  '0x15E874Bc667435ddbF2a67c0362701DC23C90833' as const;

export type HexAddress = `0x${string}`;
export type HexBytes32 = `0x${string}`;

export type DeploymentKind = 'canonical-production' | 'historical-test-only';
export type DeploymentStatus = 'undeployed' | 'deployed';

export interface ScoopHelloFixture {
  token: HexAddress;
  poolId: HexBytes32;
  launchTx: HexBytes32;
  launchBlock: number;
}

/**
 * Historical canary address bag (PascalCase Scoop* keys).
 * Kept for HELLO indexing / claims against the pre-redeploy stack only.
 */
export interface ScoopHistoricalContractAddresses {
  ScoopCreatorRegistry: HexAddress;
  ScoopTokenDeployer: HexAddress;
  ScoopLaunchDeployer: HexAddress;
  ScoopQuoteRegistry: HexAddress;
  ScoopPriceOracle: HexAddress;
  ScoopCreatorRewards: HexAddress;
  ScoopFactory: HexAddress;
  PoolManager: HexAddress;
  PositionManager: HexAddress;
  UniversalRouter: HexAddress;
  Permit2: HexAddress;
}

/** @deprecated Use ScoopHistoricalContractAddresses — not production. */
export type ScoopContractAddresses = ScoopHistoricalContractAddresses;

/**
 * Canonical production address schema (camelCase).
 * Populated only after the guarded post-P3 redeploy.
 */
export interface ScoopCanonicalContractAddresses {
  factory: HexAddress;
  creatorRegistry: HexAddress;
  creatorRewards: HexAddress;
  tokenDeployer: HexAddress;
  launchDeployer: HexAddress;
  quoteRegistry: HexAddress;
  priceOracle: HexAddress;
  rootPublisher: HexAddress;
  poolManager: HexAddress;
  positionManager: HexAddress;
  universalRouter: HexAddress;
  permit2: HexAddress;
  launchFeeRecipient: HexAddress;
  buybackVault: HexAddress;
  operations: HexAddress;
  verificationAuthority: HexAddress;
  registryAuthority: HexAddress;
  oracleAuthority: HexAddress;
}

export const CANONICAL_ADDRESS_KEYS = [
  'factory',
  'creatorRegistry',
  'creatorRewards',
  'tokenDeployer',
  'launchDeployer',
  'quoteRegistry',
  'priceOracle',
  'rootPublisher',
  'poolManager',
  'positionManager',
  'universalRouter',
  'permit2',
  'launchFeeRecipient',
  'buybackVault',
  'operations',
  'verificationAuthority',
  'registryAuthority',
  'oracleAuthority',
] as const satisfies readonly (keyof ScoopCanonicalContractAddresses)[];

export interface ScoopHistoricalTestManifest {
  protocol: 'SCOOP';
  deploymentKind: 'historical-test-only';
  status: 'deployed';
  chainId: typeof CANONICAL_CHAIN_ID;
  baseline: string;
  source: {
    repo: 'scoop-protocol';
    tag: typeof HISTORICAL_CANARY_PROTOCOL_TAG;
    commit: typeof HISTORICAL_CANARY_PROTOCOL_COMMIT;
  };
  contracts: ScoopHistoricalContractAddresses;
  fixtures: {
    hello: ScoopHelloFixture;
  };
  metadata: {
    description: string;
    indexingStartBlock: number;
  };
}

export interface ScoopCanonicalProductionManifestUndeployed {
  protocol: 'SCOOP';
  deploymentKind: 'canonical-production';
  status: 'undeployed';
  chainId: typeof CANONICAL_CHAIN_ID;
  baseline: string;
  source: {
    repo: 'scoop-protocol';
    tag: typeof CANONICAL_PROTOCOL_TAG;
    commit: typeof CANONICAL_PROTOCOL_COMMIT;
  };
  contracts: null;
  fixtures: null;
  metadata: {
    description: string;
    indexingStartBlock: null;
  };
}

export interface ScoopCanonicalProductionManifestDeployed {
  protocol: 'SCOOP';
  deploymentKind: 'canonical-production';
  status: 'deployed';
  chainId: typeof CANONICAL_CHAIN_ID;
  baseline: string;
  source: {
    repo: 'scoop-protocol';
    tag: typeof CANONICAL_PROTOCOL_TAG;
    commit: typeof CANONICAL_PROTOCOL_COMMIT;
  };
  contracts: ScoopCanonicalContractAddresses;
  fixtures: {
    hello: ScoopHelloFixture | null;
  };
  metadata: {
    description: string;
    indexingStartBlock: number | null;
  };
}

export type ScoopCanonicalProductionManifest =
  | ScoopCanonicalProductionManifestUndeployed
  | ScoopCanonicalProductionManifestDeployed;

/** @deprecated Prefer ScoopHistoricalTestManifest / ScoopCanonicalProductionManifest. */
export type ScoopProtocolManifest = ScoopHistoricalTestManifest;

function assertHexAddress(value: string, label: string): asserts value is HexAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address for ${label}: ${value}`);
  }
}

function assertHexBytes32(value: string, label: string): asserts value is HexBytes32 {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid bytes32 for ${label}: ${value}`);
  }
}

export function validateHistoricalTestManifest(
  input: unknown,
): ScoopHistoricalTestManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const manifest = input as ScoopHistoricalTestManifest;

  if (manifest.protocol !== 'SCOOP') {
    throw new Error(`Unexpected protocol: ${String(manifest.protocol)}`);
  }
  if (manifest.deploymentKind !== 'historical-test-only') {
    throw new Error(
      `Unexpected deploymentKind: ${String(manifest.deploymentKind)}`,
    );
  }
  if (manifest.status !== 'deployed') {
    throw new Error(`Unexpected status: ${String(manifest.status)}`);
  }
  if (manifest.chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Unexpected chainId: ${String(manifest.chainId)}`);
  }
  if (manifest.source?.tag !== HISTORICAL_CANARY_PROTOCOL_TAG) {
    throw new Error(`Unexpected protocol tag: ${String(manifest.source?.tag)}`);
  }
  if (manifest.source?.commit !== HISTORICAL_CANARY_PROTOCOL_COMMIT) {
    throw new Error(
      `Unexpected protocol commit: ${String(manifest.source?.commit)}`,
    );
  }

  for (const [name, address] of Object.entries(manifest.contracts ?? {})) {
    assertHexAddress(address, name);
  }

  if (
    manifest.contracts.ScoopFactory.toLowerCase() !==
    HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase()
  ) {
    throw new Error('Historical canary Factory address mismatch');
  }

  assertHexAddress(manifest.fixtures.hello.token, 'fixtures.hello.token');
  assertHexBytes32(manifest.fixtures.hello.poolId, 'fixtures.hello.poolId');
  assertHexBytes32(manifest.fixtures.hello.launchTx, 'fixtures.hello.launchTx');

  if (!Number.isInteger(manifest.fixtures.hello.launchBlock)) {
    throw new Error('fixtures.hello.launchBlock must be an integer');
  }

  return manifest;
}

export function validateCanonicalProductionManifest(
  input: unknown,
): ScoopCanonicalProductionManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const manifest = input as ScoopCanonicalProductionManifest;

  if (manifest.protocol !== 'SCOOP') {
    throw new Error(`Unexpected protocol: ${String(manifest.protocol)}`);
  }
  if (manifest.deploymentKind !== 'canonical-production') {
    throw new Error(
      `Unexpected deploymentKind: ${String(manifest.deploymentKind)}`,
    );
  }
  if (manifest.chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Unexpected chainId: ${String(manifest.chainId)}`);
  }
  if (manifest.source?.tag !== CANONICAL_PROTOCOL_TAG) {
    throw new Error(`Unexpected protocol tag: ${String(manifest.source?.tag)}`);
  }
  if (manifest.source?.commit !== CANONICAL_PROTOCOL_COMMIT) {
    throw new Error(
      `Unexpected protocol commit: ${String(manifest.source?.commit)}`,
    );
  }

  if (manifest.status === 'undeployed') {
    if (manifest.contracts !== null) {
      throw new Error('Undeployed canonical production must have contracts: null');
    }
    return manifest;
  }

  if (manifest.status !== 'deployed') {
    throw new Error(`Unexpected status: ${String((manifest as { status?: string }).status)}`);
  }

  if (!manifest.contracts || typeof manifest.contracts !== 'object') {
    throw new Error('Deployed canonical production requires contracts');
  }

  for (const key of CANONICAL_ADDRESS_KEYS) {
    const address = manifest.contracts[key];
    assertHexAddress(address, key);
  }

  if (
    manifest.contracts.factory.toLowerCase() ===
    HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      'Canonical production Factory must not equal the historical test Factory 0x15E874…',
    );
  }

  return manifest;
}

/**
 * @deprecated Validates historical canary only. Use validateHistoricalTestManifest
 * or validateCanonicalProductionManifest.
 */
export function validateManifest(input: unknown): ScoopHistoricalTestManifest {
  return validateHistoricalTestManifest(input);
}

export const historicalTestCanaryManifest = validateHistoricalTestManifest(
  rawHistoricalCanary,
);

/**
 * @deprecated Alias for historicalTestCanaryManifest — HISTORICAL TEST-ONLY.
 * Not canonical production. Prefer historicalTestCanaryManifest or
 * requireCanonicalProductionAddresses().
 */
export const scoopV1MainnetCanaryManifest = historicalTestCanaryManifest;

export const canonicalProductionManifest = validateCanonicalProductionManifest(
  rawCanonicalProduction,
);

export function isCanonicalProductionDeployed(
  manifest: ScoopCanonicalProductionManifest = canonicalProductionManifest,
): manifest is ScoopCanonicalProductionManifestDeployed {
  return manifest.status === 'deployed' && manifest.contracts !== null;
}

/**
 * Returns deployed canonical production addresses.
 * Throws if undeployed — never falls back to the historical canary Factory.
 */
export function requireCanonicalProductionAddresses(
  manifest: ScoopCanonicalProductionManifest = canonicalProductionManifest,
): ScoopCanonicalContractAddresses {
  if (!isCanonicalProductionDeployed(manifest)) {
    throw new Error(
      'Canonical production protocol is not yet deployed; refusing to use historical test Factory as production',
    );
  }
  return manifest.contracts;
}

/**
 * Resolve which Factory ABI to use for an on-chain address.
 * Historical canary Factory → historical ABI; otherwise canonical P3 ABI.
 */
export function isHistoricalTestFactoryAddress(address: string): boolean {
  return address.toLowerCase() === HISTORICAL_TEST_FACTORY_ADDRESS.toLowerCase();
}
