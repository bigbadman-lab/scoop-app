/**
 * Fee Keeper env — writes disabled unless SCOOP_FEE_KEEPER_WRITE_ENABLED=true.
 * Never log private keys.
 *
 * Deployment mode:
 *   historical-test (default until canonical redeploy) — explicit HELLO/canary stack
 *   canonical-production — refuses to start while production manifest is undeployed
 */
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  SCOOP_CHAIN_ID,
  canonicalProductionManifest,
  historicalTestCanaryManifest,
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
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

const hexKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'SCOOP_FEE_KEEPER_PRIVATE_KEY must be 0x + 64 hex');

export type FeeKeeperDeploymentMode = 'historical-test' | 'canonical-production';

export type FeeKeeperConfig = {
  writeEnabled: boolean;
  chainId: number;
  deploymentMode: FeeKeeperDeploymentMode;
  /** Factory identity for logs — never silently swaps historical ↔ production. */
  factoryAddress: string | null;
  rpcUrl: string;
  databaseUrl: string;
  /** Direct/non-pooled URL for advisory lock (falls back to DATABASE_URL). */
  lockDatabaseUrl: string;
  activityLookbackMinutes: number;
  fallbackSweepMinutes: number;
  /** Must match Render cron cadence (default 15). */
  cronWindowMinutes: number;
  /** Required when writeEnabled; lowercase checksum-insensitive. */
  expectedKeeperAddress: Address | null;
  /** Present only when writeEnabled — never logged. */
  privateKey: Hex | null;
  lowBalanceWeiWarning: bigint;
};

export type LoadedFeeKeeperConfig = FeeKeeperConfig & {
  mode: 'dry-run' | 'write';
};

function parseDeploymentMode(raw: string | undefined): FeeKeeperDeploymentMode {
  // Default historical-test: operational path until canonical redeploy.
  if (raw == null || raw.trim() === '') return 'historical-test';
  const v = raw.trim().toLowerCase();
  if (v === 'historical-test' || v === 'historical') return 'historical-test';
  if (v === 'canonical-production' || v === 'canonical' || v === 'production') {
    return 'canonical-production';
  }
  throw new Error(
    `Invalid SCOOP_FEE_KEEPER_DEPLOYMENT_MODE: ${raw} (expected historical-test | canonical-production)`,
  );
}

/**
 * Resolve factory identity for the selected deployment mode.
 * Never falls back from canonical-production to the historical Factory.
 */
export function resolveDeploymentFactory(
  mode: FeeKeeperDeploymentMode,
): { factoryAddress: string | null; source: string } {
  if (mode === 'historical-test') {
    return {
      factoryAddress: historicalTestCanaryManifest.contracts.ScoopFactory,
      source: 'historicalTestCanaryManifest',
    };
  }
  if (!isCanonicalProductionDeployed(canonicalProductionManifest)) {
    throw new Error(
      'FATAL: SCOOP_FEE_KEEPER_DEPLOYMENT_MODE=canonical-production but canonical production is undeployed; refusing to fall back to historical Factory',
    );
  }
  const addresses = requireCanonicalProductionAddresses(canonicalProductionManifest);
  return {
    factoryAddress: addresses.factory,
    source: 'canonicalProductionManifest',
  };
}

/**
 * Parse env. Unset WRITE_ENABLED ⇒ false (dry-run).
 * Private key required only when writes are enabled.
 */
export function loadFeeKeeperConfig(
  env: NodeJS.ProcessEnv = process.env,
): LoadedFeeKeeperConfig {
  const writeEnabled = parseBool(env.SCOOP_FEE_KEEPER_WRITE_ENABLED, false);
  const chainId = parsePositiveInt(
    env.SCOOP_FEE_KEEPER_CHAIN_ID,
    SCOOP_CHAIN_ID,
    'SCOOP_FEE_KEEPER_CHAIN_ID',
  );
  if (chainId !== SCOOP_CHAIN_ID) {
    throw new Error(
      `FATAL: SCOOP_FEE_KEEPER_CHAIN_ID must be ${SCOOP_CHAIN_ID}, got ${chainId}`,
    );
  }

  const deploymentMode = parseDeploymentMode(env.SCOOP_FEE_KEEPER_DEPLOYMENT_MODE);
  const deployment = resolveDeploymentFactory(deploymentMode);

  const rpcUrl = (env.ROBINHOOD_RPC_URL ?? '').trim();
  if (!rpcUrl) {
    throw new Error('ROBINHOOD_RPC_URL is required');
  }

  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const lockDatabaseUrl =
    (env.INDEXER_LOCK_DATABASE_URL ?? '').trim() || databaseUrl;

  const activityLookbackMinutes = parsePositiveInt(
    env.SCOOP_FEE_KEEPER_ACTIVITY_LOOKBACK_MINUTES,
    120,
    'SCOOP_FEE_KEEPER_ACTIVITY_LOOKBACK_MINUTES',
  );
  const fallbackSweepMinutes = parsePositiveInt(
    env.SCOOP_FEE_KEEPER_FALLBACK_SWEEP_MINUTES,
    1440,
    'SCOOP_FEE_KEEPER_FALLBACK_SWEEP_MINUTES',
  );
  const cronWindowMinutes = parsePositiveInt(
    env.SCOOP_FEE_KEEPER_CRON_WINDOW_MINUTES,
    15,
    'SCOOP_FEE_KEEPER_CRON_WINDOW_MINUTES',
  );

  const addressRaw = (env.SCOOP_FEE_KEEPER_ADDRESS ?? '').trim();
  let expectedKeeperAddress: Address | null = null;
  if (addressRaw) {
    if (!isAddress(addressRaw)) {
      throw new Error('SCOOP_FEE_KEEPER_ADDRESS is not a valid address');
    }
    expectedKeeperAddress = addressRaw.toLowerCase() as Address;
  }

  let privateKey: Hex | null = null;
  const pkRaw = (env.SCOOP_FEE_KEEPER_PRIVATE_KEY ?? '').trim();

  if (writeEnabled && !pkRaw) {
    throw new Error(
      'SCOOP_FEE_KEEPER_PRIVATE_KEY is required when SCOOP_FEE_KEEPER_WRITE_ENABLED=true',
    );
  }

  if (pkRaw) {
    const parsed = hexKeySchema.parse(pkRaw) as Hex;
    if (!expectedKeeperAddress) {
      throw new Error(
        'SCOOP_FEE_KEEPER_ADDRESS is required when a keeper private key is configured (address pin)',
      );
    }
    const derived = privateKeyToAccount(parsed).address.toLowerCase() as Address;
    if (derived !== expectedKeeperAddress) {
      throw new Error(
        'FATAL: signer address does not match SCOOP_FEE_KEEPER_ADDRESS',
      );
    }
    if (writeEnabled) {
      privateKey = parsed;
    }
  }

  return {
    writeEnabled,
    mode: writeEnabled ? 'write' : 'dry-run',
    chainId,
    deploymentMode,
    factoryAddress: deployment.factoryAddress,
    rpcUrl,
    databaseUrl,
    lockDatabaseUrl,
    activityLookbackMinutes,
    fallbackSweepMinutes,
    cronWindowMinutes,
    expectedKeeperAddress,
    privateKey,
    lowBalanceWeiWarning: 10n ** 15n, // 0.001 ETH
  };
}

/** Public view for logs — never includes privateKey. */
export function publicConfigView(config: LoadedFeeKeeperConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    writeEnabled: config.writeEnabled,
    chainId: config.chainId,
    deploymentMode: config.deploymentMode,
    factoryAddress: config.factoryAddress,
    keeperAddress: config.expectedKeeperAddress,
    activityLookbackMinutes: config.activityLookbackMinutes,
    fallbackSweepMinutes: config.fallbackSweepMinutes,
    cronWindowMinutes: config.cronWindowMinutes,
    hasRpcUrl: Boolean(config.rpcUrl),
    hasDatabaseUrl: Boolean(config.databaseUrl),
    hasLockDatabaseUrl: Boolean(config.lockDatabaseUrl),
  };
}
