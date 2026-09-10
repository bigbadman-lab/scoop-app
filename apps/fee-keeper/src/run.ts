import { randomUUID } from 'node:crypto';
import {
  createPool,
  listFeeKeeperMarkets,
  type FeeKeeperMarket,
} from '@scoop/db';
import {
  assertRpcChainId,
  createFeeKeeperClients,
  getNativeBalance,
  resolveWriteGate,
  type FeeKeeperClients,
  type WriteGate,
} from './clients.js';
import {
  loadFeeKeeperConfig,
  publicConfigView,
  type LoadedFeeKeeperConfig,
} from './config.js';
import { tryAcquireFeeKeeperLock } from './lock.js';
import { logJson } from './log.js';
import { serviceMarket } from './service-market.js';

export type RunFeeKeeperResult = {
  exitCode: number;
  runId: string;
  mode: 'dry-run' | 'write';
  writeEnabled: boolean;
  marketsDiscovered: number;
  marketsServiced: number;
  marketsSkipped: number;
  marketsFailed: number;
  transactionsSent: number;
  /** True if any writeContract/send path executed. */
  writesAttempted: boolean;
};

export type RunFeeKeeperDeps = {
  loadConfig?: () => LoadedFeeKeeperConfig;
  listMarkets?: (
    config: LoadedFeeKeeperConfig,
  ) => Promise<FeeKeeperMarket[]>;
  acquireLock?: (config: LoadedFeeKeeperConfig) => ReturnType<
    typeof tryAcquireFeeKeeperLock
  >;
  createClients?: (config: LoadedFeeKeeperConfig) => FeeKeeperClients;
  nowSec?: () => number;
};

/**
 * One-shot fee keeper run. Exits without servicing if lock unavailable.
 * Default write gate is off — no broadcasts unless explicitly enabled.
 */
export async function runFeeKeeper(
  deps: RunFeeKeeperDeps = {},
): Promise<RunFeeKeeperResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const loadConfig = deps.loadConfig ?? (() => loadFeeKeeperConfig());
  const config = loadConfig();

  logJson('info', 'fee_keeper_start', {
    runId,
    startedAt,
    ...publicConfigView(config),
  });

  const acquireLock =
    deps.acquireLock ??
    ((cfg: LoadedFeeKeeperConfig) =>
      tryAcquireFeeKeeperLock({ databaseUrl: cfg.lockDatabaseUrl }));

  const lockResult = await acquireLock(config);
  if (!lockResult.ok) {
    logJson('warn', 'fee_keeper_lock_unavailable', {
      runId,
      reason: lockResult.reason,
      error: lockResult.error,
      lock: "hashtext('scoop_fee_keeper')",
    });
    return {
      exitCode: 0,
      runId,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
      marketsDiscovered: 0,
      marketsServiced: 0,
      marketsSkipped: 0,
      marketsFailed: 0,
      transactionsSent: 0,
      writesAttempted: false,
    };
  }

  const lock = lockResult.lock;
  let writesAttempted = false;
  let marketsDiscovered = 0;
  let marketsServiced = 0;
  let marketsSkipped = 0;
  let marketsFailed = 0;
  let transactionsSent = 0;
  let gasUsedTotal = 0n;
  let stopWrites = false;

  try {
    const createClients = deps.createClients ?? createFeeKeeperClients;
    const clients = createClients(config);
    try {
      await assertRpcChainId(clients.publicClient, config.chainId);
    } catch (error) {
      logJson('error', 'fee_keeper_fatal_chain', {
        runId,
        errorClass: 'FATAL',
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        exitCode: 2,
        runId,
        mode: config.mode,
        writeEnabled: config.writeEnabled,
        marketsDiscovered: 0,
        marketsServiced: 0,
        marketsSkipped: 0,
        marketsFailed: 0,
        transactionsSent: 0,
        writesAttempted: false,
      };
    }

    let writeGate: WriteGate = resolveWriteGate(clients);
    // Gas observation: always when a pinned keeper address is known.
    // Writes stop only when write mode is on and balance is zero.
    if (config.expectedKeeperAddress) {
      const bal = await getNativeBalance(
        clients.publicClient,
        config.expectedKeeperAddress,
      );
      if (bal < config.lowBalanceWeiWarning) {
        logJson('warn', 'fee_keeper_low_gas', {
          runId,
          keeperAddress: config.expectedKeeperAddress,
          balanceWei: bal.toString(),
          errorClass: 'ALERT',
          writeEnabled: writeGate.enabled,
        });
      }
      if (writeGate.enabled && bal === 0n) {
        logJson('error', 'fee_keeper_no_gas', {
          runId,
          keeperAddress: config.expectedKeeperAddress,
          errorClass: 'ALERT',
        });
        stopWrites = true;
        writeGate = { enabled: false };
      }
    }

    const listMarkets =
      deps.listMarkets ??
      (async (cfg: LoadedFeeKeeperConfig) => {
        const pool = createPool(cfg.databaseUrl);
        try {
          return await listFeeKeeperMarkets(pool, cfg.chainId);
        } finally {
          await pool.end();
        }
      });

    const markets = await listMarkets(config);
    marketsDiscovered = markets.length;
    const nowSec = deps.nowSec?.() ?? Math.floor(Date.now() / 1000);

    logJson('info', 'fee_keeper_markets_loaded', {
      runId,
      marketsDiscovered,
      writeEnabled: writeGate.enabled,
    });

    for (const market of markets) {
      if (stopWrites && config.writeEnabled) {
        writeGate = { enabled: false };
      }
      const outcome = await serviceMarket({
        market,
        publicClient: clients.publicClient,
        writeGate,
        nowSec,
        activityLookbackMinutes: config.activityLookbackMinutes,
        fallbackSweepMinutes: config.fallbackSweepMinutes,
        cronWindowMinutes: config.cronWindowMinutes,
        account: writeGate.enabled ? writeGate.account : undefined,
      });

      if (outcome.transactionsSent > 0) {
        writesAttempted = true;
        transactionsSent += outcome.transactionsSent;
        gasUsedTotal += outcome.gasUsed;
      }

      if (outcome.status === 'serviced') marketsServiced += 1;
      else if (outcome.status === 'skipped') marketsSkipped += 1;
      else marketsFailed += 1;

      if (outcome.stopWrites) {
        stopWrites = true;
        writeGate = { enabled: false };
      }
    }

    const completedAt = new Date().toISOString();
    logJson('info', 'fee_keeper_complete', {
      runId,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
      chainId: config.chainId,
      keeperAddress: config.expectedKeeperAddress,
      startedAt,
      completedAt,
      marketsDiscovered,
      marketsEligible: marketsDiscovered,
      marketsServiced,
      marketsSkipped,
      marketsFailed,
      transactionsSent,
      gasUsed: gasUsedTotal.toString(),
      writesAttempted,
    });

    return {
      exitCode: 0,
      runId,
      mode: config.mode,
      writeEnabled: config.writeEnabled,
      marketsDiscovered,
      marketsServiced,
      marketsSkipped,
      marketsFailed,
      transactionsSent,
      writesAttempted,
    };
  } finally {
    await lock.release();
  }
}
