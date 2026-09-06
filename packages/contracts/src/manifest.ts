import rawManifest from './manifests/scoop-v1-mainnet-canary.json' with { type: 'json' };

export const CANONICAL_CHAIN_ID = 4663 as const;
export const CANONICAL_PROTOCOL_TAG = 'scoop-v1-mainnet-canary' as const;
export const CANONICAL_PROTOCOL_COMMIT =
  'c8268c0a97274cb751f4077d0e28450caf276357' as const;

export type HexAddress = `0x${string}`;
export type HexBytes32 = `0x${string}`;

export interface ScoopHelloFixture {
  token: HexAddress;
  poolId: HexBytes32;
  launchTx: HexBytes32;
  launchBlock: number;
}

export interface ScoopContractAddresses {
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

export interface ScoopProtocolManifest {
  protocol: 'SCOOP';
  chainId: typeof CANONICAL_CHAIN_ID;
  baseline: string;
  source: {
    repo: 'scoop-protocol';
    tag: typeof CANONICAL_PROTOCOL_TAG;
    commit: typeof CANONICAL_PROTOCOL_COMMIT;
  };
  contracts: ScoopContractAddresses;
  fixtures: {
    hello: ScoopHelloFixture;
  };
  metadata: {
    description: string;
    indexingStartBlock: number;
  };
}

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

export function validateManifest(input: unknown): ScoopProtocolManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const manifest = input as ScoopProtocolManifest;

  if (manifest.protocol !== 'SCOOP') {
    throw new Error(`Unexpected protocol: ${String(manifest.protocol)}`);
  }
  if (manifest.chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Unexpected chainId: ${String(manifest.chainId)}`);
  }
  if (manifest.source?.tag !== CANONICAL_PROTOCOL_TAG) {
    throw new Error(`Unexpected protocol tag: ${String(manifest.source?.tag)}`);
  }
  if (manifest.source?.commit !== CANONICAL_PROTOCOL_COMMIT) {
    throw new Error(`Unexpected protocol commit: ${String(manifest.source?.commit)}`);
  }

  for (const [name, address] of Object.entries(manifest.contracts ?? {})) {
    assertHexAddress(address, name);
  }

  assertHexAddress(manifest.fixtures.hello.token, 'fixtures.hello.token');
  assertHexBytes32(manifest.fixtures.hello.poolId, 'fixtures.hello.poolId');
  assertHexBytes32(manifest.fixtures.hello.launchTx, 'fixtures.hello.launchTx');

  if (!Number.isInteger(manifest.fixtures.hello.launchBlock)) {
    throw new Error('fixtures.hello.launchBlock must be an integer');
  }

  return manifest;
}

export const scoopV1MainnetCanaryManifest = validateManifest(rawManifest);
