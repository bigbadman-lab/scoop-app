/**
 * One-shot holder rewards worker. Dry-run by default — no broadcasts.
 */
import { randomUUID } from 'node:crypto';
import {
  createPool,
  listHolderRewardVaultMarkets,
  type HolderRewardsVaultMarket,
  type Queryable,
} from '@scoop/db';
import {
  canonicalProductionManifest,
  historicalTestCanaryManifest,
  isCanonicalProductionDeployed,
} from '@scoop/shared';
import { type Address } from 'viem';
import {
  assertRpcChainId,
  createHolderRewardsClients,
  type HolderRewardsClients,
} from './clients.js';
import {
  loadHolderRewardsConfig,
  publicConfigView,
  type LoadedHolderRewardsConfig,
} from './config.js';
import { tryAcquireHolderRewardsLock } from './lock.js';
import { logJson } from './log.js';
import { serviceVault, type VaultServiceStats } from './service-vault.js';

export type RunHolderRewardsResult = {
  exitCode: number;
  runId: string;
  mode: 'dry-run' | 'write';
  writeEnabled: boolean;
  launchesDiscovered: number;
  roundAssetsConsidered: number;
  snapshotsReady: number;
  roundsComputed: number;
  rootsSimulated: number;
  rootsPublished: number;
  pushBatchesSimulated: number;
  pushBatchesSent: number;
  leavesPaid: number;
  leavesFailed: number;
  roundsSkipped: number;
  errors: number;
  transactionsSent: number;
  writesAttempted: boolean;
};

export type RunHolderRewardsDeps = {
  loadConfig?: () => LoadedHolderRewardsConfig;
  listVaults?: (
    config: LoadedHolderRewardsConfig,
  ) => Promise<HolderRewardsVaultMarket[]>;
  acquireLock?: (
    config: LoadedHolderRewardsConfig,
  ) => ReturnType<typeof tryAcquireHolderRewardsLock>;
  createClients?: (
    config: LoadedHolderRewardsConfig,
  ) => HolderRewardsClients | null;
  createDb?: (databaseUrl: string) => Queryable & { end?: () => Promise<void> };
  nowSec?: () => number;
  serviceVaultFn?: typeof serviceVault;
};

function emptyTotals(): Omit<
  RunHolderRewardsResult,
  'exitCode' | 'runId' | 'mode' | 'writeEnabled' | 'launchesDiscovered'
> {
  return {
    roundAssetsConsidered: 0,
    snapshotsReady: 0,
    roundsComputed: 0,
    rootsSimulated: 0,
    rootsPublished: 0,
    pushBatchesSimulated: 0,
    pushBatchesSent: 0,
    leavesPaid: 0,
    leavesFailed: 0,
    roundsSkipped: 0,
    errors: 0,
    transactionsSent: 0,
    writesAttempted: false,
  };
}

function addVaultStats(
  totals: ReturnType<typeof emptyTotals>,
  s: VaultServiceStats,
): void {
  totals.roundAssetsConsidered += s.roundAssetsConsidered;
  totals.snapshotsReady += s.snapshotsReady;
  totals.roundsComputed += s.roundsComputed;
  totals.rootsSimulated += s.rootsSimulated;
  totals.rootsPublished += s.rootsPublished;
  totals.pushBatchesSimulated += s.pushBatchesSimulated;
  totals.pushBatchesSent += s.pushBatchesSent;
  totals.leavesPaid += s.leavesPaid;
  totals.leavesFailed += s.leavesFailed;
  totals.roundsSkipped += s.roundsSkipped;
  totals.errors += s.errors;
  totals.transactionsSent += s.transactionsSent;
  totals.writesAttempted = totals.writesAttempted || s.writesAttempted;
}

/**
 * One-shot holder rewards run. Exits cleanly if lock unavailable.
 * Default write gate is off — no broadcasts unless explicitly enabled.
 */
export async function runHolderRewardsWorker(
  deps: RunHolderRewardsDeps = {},
): Promise<RunHolderRewardsResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const loadConfig = deps.loadConfig ?? (() => loadHolderRewardsConfig());
  const config = loadConfig();

  logJson('info', 'worker_start', {
    runId,
    startedAt,
    ...publicConfigView(config),
  });

  if (
    config.deploymentMode === 'canonical-production' &&
    !isCanonicalProductionDeployed(canonicalProductionManifest)
  ) {
    logJson('error', 'worker_complete', {
      runId,
      errorClass: 'FATAL',
      error: 'canonical production undeployed; refusing writes and historical fallback',
    });
    return {
      exitCode: 2,
      runId,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
      launchesDiscovered: 0,
      ...emptyTotals(),
    };
  }

  const acquireLock =
    deps.acquireLock ??
    ((cfg: LoadedHolderRewardsConfig) => {
      if (!cfg.lockDatabaseUrl) {
        return Promise.resolve({
          ok: false as const,
          reason: 'error' as const,
          error: 'lock databaseUrl required',
        });
      }
      return tryAcquireHolderRewardsLock({ databaseUrl: cfg.lockDatabaseUrl });
    });

  const lockResult = await acquireLock(config);
  if (!lockResult.ok) {
    logJson('warn', 'lock_unavailable', {
      runId,
      reason: lockResult.reason,
      error: lockResult.error,
      lock: "hashtext('scoop_holder_rewards')",
    });
    return {
      exitCode: 0,
      runId,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
      launchesDiscovered: 0,
      ...emptyTotals(),
    };
  }

  logJson('info', 'lock_acquired', {
    runId,
    lock: "hashtext('scoop_holder_rewards')",
  });

  const lock = lockResult.lock;
  const totals = emptyTotals();
  let launchesDiscovered = 0;
  let exitCode = 0;
  let pool: (Queryable & { end?: () => Promise<void> }) | null = null;

  try {
    const createClients =
      deps.createClients ??
      ((cfg: LoadedHolderRewardsConfig) => {
        if (!cfg.rpcUrl) return null;
        return createHolderRewardsClients(cfg);
      });
    const clients = createClients(config);

    if (clients) {
      try {
        await assertRpcChainId(clients.publicClient, config.chainId);
      } catch (error) {
        logJson('error', 'worker_complete', {
          runId,
          errorClass: 'FATAL',
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          exitCode: 2,
          runId,
          mode: config.mode,
          writeEnabled: config.writeEnabled,
          launchesDiscovered: 0,
          ...emptyTotals(),
        };
      }
    }

    const listVaults =
      deps.listVaults ??
      (async (cfg: LoadedHolderRewardsConfig) => {
        if (!cfg.databaseUrl) return [];
        pool =
          deps.createDb?.(cfg.databaseUrl) ??
          (createPool(cfg.databaseUrl) as Queryable & {
            end?: () => Promise<void>;
          });
        return listHolderRewardVaultMarkets(pool, cfg.chainId);
      });

    const markets = await listVaults(config);
    launchesDiscovered = markets.length;

    // Ensure we have a DB handle for transfer/snapshot reads when listVaults injected.
    if (!pool && config.databaseUrl) {
      pool =
        deps.createDb?.(config.databaseUrl) ??
        (createPool(config.databaseUrl) as Queryable & {
          end?: () => Promise<void>;
        });
    }

    const factoryAddress =
      (historicalTestCanaryManifest.contracts.ScoopFactory?.toLowerCase() as
        | Address
        | undefined) ?? null;
    const poolManagerAddress = null;

    const service = deps.serviceVaultFn ?? serviceVault;
    const nowUnix = (deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))();

    if (!pool) {
      logJson('warn', 'worker_complete', {
        runId,
        note: 'no database; nothing to service',
        launchesDiscovered: 0,
      });
    } else {
      for (const market of markets) {
        const vaultStats = await service({
          db: pool,
          clients,
          config,
          market,
          runId,
          nowUnix,
          deps: {
            persistComputed: config.writeEnabled,
            factoryAddress,
            poolManagerAddress,
          },
        });
        addVaultStats(totals, vaultStats);
      }
    }

    logJson('info', 'worker_complete', {
      runId,
      launchesDiscovered,
      ...totals,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
    });
  } catch (error) {
    exitCode = 1;
    logJson('error', 'worker_complete', {
      runId,
      errorClass: 'FATAL',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      await lock.release();
    } catch {
      /* ignore */
    }
    if (pool && typeof pool.end === 'function') {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    exitCode,
    runId,
    mode: config.mode,
    writeEnabled: config.writeEnabled,
    launchesDiscovered,
    ...totals,
  };
}
