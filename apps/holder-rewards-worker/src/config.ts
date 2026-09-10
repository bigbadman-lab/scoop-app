/**
 * Holder rewards worker env — writes disabled unless WRITE_ENABLED=true.
 * Never reuse fee-keeper private key. Never log secrets.
 */
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  SCOOP_CHAIN_ID,
  canonicalProductionManifest,
  isCanonicalProductionDeployed,
  requireCanonicalProductionAddresses,
} from '@scoop/shared';

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new Error(`Invalid boolean env value: ${raw}`);
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${name}: ${raw}`);
  return n;
}

const hexKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'private key must be 0x + 64 hex');

export type HolderRewardsDeploymentMode = 'fixture-test' | 'canonical-production';

export type LoadedHolderRewardsConfig = {
  writeEnabled: boolean;
  mode: 'dry-run' | 'write';
  chainId: number;
  deploymentMode: HolderRewardsDeploymentMode;
  rpcUrl: string | null;
  databaseUrl: string | null;
  lockDatabaseUrl: string | null;
  maxRoundsPerRun: number;
  snapshotConfirmations: number;
  pushBatchSize: number;
  expectedPublisherAddress: Address | null;
  publisherPrivateKey: Hex | null;
  expectedPushAddress: Address | null;
  pushPrivateKey: Hex | null;
};

function parseDeploymentMode(raw: string | undefined): HolderRewardsDeploymentMode {
  if (raw == null || raw.trim() === '') return 'fixture-test';
  const v = raw.trim().toLowerCase();
  if (v === 'fixture-test' || v === 'local-test' || v === 'fixture') {
    return 'fixture-test';
  }
  if (v === 'canonical-production' || v === 'canonical' || v === 'production') {
    return 'canonical-production';
  }
  throw new Error(
    `Invalid SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE: ${raw} (expected fixture-test | canonical-production)`,
  );
}

function parsePinnedKey(args: {
  pkRaw: string;
  addressRaw: string;
  label: string;
  retainKey: boolean;
}): { address: Address; privateKey: Hex | null } {
  const parsed = hexKeySchema.parse(args.pkRaw) as Hex;
  if (!isAddress(args.addressRaw)) {
    throw new Error(`${args.label} address is not valid`);
  }
  const expected = args.addressRaw.toLowerCase() as Address;
  const derived = privateKeyToAccount(parsed).address.toLowerCase() as Address;
  if (derived !== expected) {
    throw new Error(`FATAL: ${args.label} signer does not match configured address`);
  }
  return { address: expected, privateKey: args.retainKey ? parsed : null };
}

export function loadHolderRewardsConfig(
  env: NodeJS.ProcessEnv = process.env,
): LoadedHolderRewardsConfig {
  // Hard refuse accidental fee-keeper key reuse.
  if ((env.SCOOP_FEE_KEEPER_PRIVATE_KEY ?? '').trim()) {
    // Presence of fee-keeper key in env is fine for other processes; worker must not read it.
  }
  if (
    (env.SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY ?? '').trim() &&
    (env.SCOOP_FEE_KEEPER_PRIVATE_KEY ?? '').trim() &&
    env.SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY === env.SCOOP_FEE_KEEPER_PRIVATE_KEY
  ) {
    throw new Error(
      'FATAL: holder rewards publisher must not reuse SCOOP_FEE_KEEPER_PRIVATE_KEY',
    );
  }

  const writeEnabled = parseBool(env.SCOOP_HOLDER_REWARDS_WRITE_ENABLED, false);
  const chainId = parsePositiveInt(
    env.SCOOP_HOLDER_REWARDS_CHAIN_ID,
    SCOOP_CHAIN_ID,
    'SCOOP_HOLDER_REWARDS_CHAIN_ID',
  );
  if (chainId !== SCOOP_CHAIN_ID) {
    throw new Error(`FATAL: SCOOP_HOLDER_REWARDS_CHAIN_ID must be ${SCOOP_CHAIN_ID}`);
  }

  const deploymentMode = parseDeploymentMode(env.SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE);
  if (deploymentMode === 'canonical-production') {
    if (!isCanonicalProductionDeployed(canonicalProductionManifest)) {
      throw new Error(
        'FATAL: SCOOP_HOLDER_REWARDS_DEPLOYMENT_MODE=canonical-production but canonical production is undeployed; refusing historical fallback',
      );
    }
    requireCanonicalProductionAddresses(canonicalProductionManifest);
  }

  const maxRoundsPerRun = parsePositiveInt(
    env.SCOOP_HOLDER_REWARDS_MAX_ROUNDS_PER_RUN,
    24,
    'SCOOP_HOLDER_REWARDS_MAX_ROUNDS_PER_RUN',
  );
  const snapshotConfirmations = parsePositiveInt(
    env.SCOOP_HOLDER_REWARDS_SNAPSHOT_CONFIRMATIONS,
    64,
    'SCOOP_HOLDER_REWARDS_SNAPSHOT_CONFIRMATIONS',
  );
  let pushBatchSize = parsePositiveInt(
    env.SCOOP_HOLDER_REWARDS_PUSH_BATCH_SIZE,
    50,
    'SCOOP_HOLDER_REWARDS_PUSH_BATCH_SIZE',
  );
  if (pushBatchSize > 100) {
    throw new Error('SCOOP_HOLDER_REWARDS_PUSH_BATCH_SIZE hard cap is 100');
  }

  const rpcUrl = (env.ROBINHOOD_RPC_URL ?? '').trim() || null;
  const databaseUrl = (env.DATABASE_URL ?? '').trim() || null;
  const lockDatabaseUrl =
    (env.INDEXER_LOCK_DATABASE_URL ?? '').trim() || databaseUrl;

  if (deploymentMode === 'canonical-production') {
    if (!rpcUrl) throw new Error('ROBINHOOD_RPC_URL is required for canonical-production');
    if (!databaseUrl) throw new Error('DATABASE_URL is required for canonical-production');
  }

  let expectedPublisherAddress: Address | null = null;
  let publisherPrivateKey: Hex | null = null;
  const pubPk = (env.SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY ?? '').trim();
  const pubAddr = (env.SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS ?? '').trim();
  if (writeEnabled && !pubPk) {
    throw new Error(
      'SCOOP_HOLDER_REWARDS_PUBLISHER_PRIVATE_KEY required when WRITE_ENABLED=true',
    );
  }
  if (pubPk) {
    if (!pubAddr) {
      throw new Error('SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS required with publisher key');
    }
    const pinned = parsePinnedKey({
      pkRaw: pubPk,
      addressRaw: pubAddr,
      label: 'publisher',
      retainKey: writeEnabled,
    });
    expectedPublisherAddress = pinned.address;
    publisherPrivateKey = pinned.privateKey;
  } else if (pubAddr) {
    if (!isAddress(pubAddr)) throw new Error('SCOOP_HOLDER_REWARDS_PUBLISHER_ADDRESS invalid');
    expectedPublisherAddress = pubAddr.toLowerCase() as Address;
  }

  let expectedPushAddress: Address | null = null;
  let pushPrivateKey: Hex | null = null;
  const pushPk = (env.SCOOP_HOLDER_REWARDS_PUSH_PRIVATE_KEY ?? '').trim();
  const pushAddr = (env.SCOOP_HOLDER_REWARDS_PUSH_ADDRESS ?? '').trim();
  if (pushPk) {
    if (!pushAddr) {
      throw new Error('SCOOP_HOLDER_REWARDS_PUSH_ADDRESS required with push key');
    }
    const pinned = parsePinnedKey({
      pkRaw: pushPk,
      addressRaw: pushAddr,
      label: 'push',
      retainKey: writeEnabled,
    });
    expectedPushAddress = pinned.address;
    pushPrivateKey = pinned.privateKey;
  } else if (writeEnabled && publisherPrivateKey) {
    // Same operational wallet may push (permissionless) when push key unset.
    expectedPushAddress = expectedPublisherAddress;
    pushPrivateKey = publisherPrivateKey;
  }

  return {
    writeEnabled,
    mode: writeEnabled ? 'write' : 'dry-run',
    chainId,
    deploymentMode,
    rpcUrl,
    databaseUrl,
    lockDatabaseUrl,
    maxRoundsPerRun,
    snapshotConfirmations,
    pushBatchSize,
    expectedPublisherAddress,
    publisherPrivateKey,
    expectedPushAddress,
    pushPrivateKey,
  };
}

export function publicConfigView(
  config: LoadedHolderRewardsConfig,
): Record<string, unknown> {
  return {
    mode: config.mode,
    writeEnabled: config.writeEnabled,
    chainId: config.chainId,
    deploymentMode: config.deploymentMode,
    publisherAddress: config.expectedPublisherAddress,
    pushAddress: config.expectedPushAddress,
    maxRoundsPerRun: config.maxRoundsPerRun,
    snapshotConfirmations: config.snapshotConfirmations,
    pushBatchSize: config.pushBatchSize,
    hasRpcUrl: Boolean(config.rpcUrl),
    hasDatabaseUrl: Boolean(config.databaseUrl),
  };
}
