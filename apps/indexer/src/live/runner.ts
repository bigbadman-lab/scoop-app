import { createPool, withTransaction, getIndexerCheckpoint, upsertIndexerHealth } from '@scoop/db';
import type { IndexerConfig } from '../config.js';
import { MAIN_STREAM_NAME, publicConfigView, sanitizeRpcLabel } from '../config.js';
import { createFailoverRpc } from './rpc/failover.js';
import { loadWatchlist, watchlistSize } from './watchlist.js';
import { processBlock } from './processBlock.js';
import { processFastCatchupRange, shouldUseFastCatchup } from './fastCatchup.js';
import { handleReorgIfNeeded } from './reorg.js';
import { promoteConfirmations, type ConfirmationHeads } from './confirmations.js';
import { maybeSnapshotQuoteUsd } from './quoteSnapshot.js';
import {
  acquireIndexerAdvisoryLock,
  assertMigrationCompatibilityFromPool,
  type AdvisoryLockHandle,
} from './guardrails.js';

function logJson(level: string, message: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    }),
  );
}

export interface RunnerOptions {
  config: IndexerConfig;
  /** Process at most this many batches then exit (once/catchup). */
  maxBatches?: number;
  /** Exit after reaching this block (inclusive), or config.SCOOP_INDEX_TO_BLOCK. */
  indexToBlock?: number;
  /** Catchup: stop when within this many blocks of head. */
  headLagTarget?: number;
  /** Optional WS wake — non-canonical; polling remains source of truth. */
  enableWsWake?: boolean;
}

export interface RunnerResult {
  batches: number;
  lastBlock: bigint | null;
  stoppedReason: string;
}

/**
 * Production indexer runner.
 * Refuses unless SCOOP_INDEXING_ENABLED=true.
 * Exits cleanly on SIGINT/SIGTERM and when bounded mode completes.
 * Holds a Postgres advisory lock for singleton enforcement.
 */
export async function runIndexer(opts: RunnerOptions): Promise<RunnerResult> {
  const { config } = opts;
  if (!config.SCOOP_INDEXING_ENABLED) {
    throw new Error('Refusing to start: SCOOP_INDEXING_ENABLED is not true');
  }
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  if (!config.ROBINHOOD_RPC_URL) {
    throw new Error('ROBINHOOD_RPC_URL is required when indexing is enabled');
  }

  const indexToBlock = opts.indexToBlock ?? config.SCOOP_INDEX_TO_BLOCK;
  const maxBatches = opts.maxBatches;
  const headLagTarget = opts.headLagTarget ?? 0;

  logJson('info', 'indexer runner starting', {
    phase: '6A.7b',
    config: publicConfigView(config),
    maxBatches: maxBatches ?? null,
    indexToBlock: indexToBlock ?? null,
  });

  let lock: AdvisoryLockHandle | null = null;
  try {
    lock = await acquireIndexerAdvisoryLock(config.DATABASE_URL);
  } catch (error) {
    logJson('error', 'indexer singleton lock failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  logJson('info', 'indexer advisory lock acquired', { key: "hashtext('scoop_indexer')" });

  const rpc = createFailoverRpc({
    primaryUrl: config.ROBINHOOD_RPC_URL,
    fallbackUrl: config.ROBINHOOD_FALLBACK_RPC_URL,
  });
  const pool = createPool(config.DATABASE_URL);

  try {
    await assertMigrationCompatibilityFromPool(pool);
    logJson('info', 'migration compatibility ok', {
      required: 'token_market_state.launch_progress_bps',
    });
  } catch (error) {
    await lock.release();
    await pool.end();
    throw error;
  }

  let stopRequested = false;
  let stopReason = 'running';
  const onSignal = (sig: string) => {
    stopRequested = true;
    stopReason = sig;
    logJson('info', 'shutdown signal received — finishing current batch', { signal: sig });
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  let batches = 0;
  let lastBlock: bigint | null = null;
  let lastQuoteAtMs = 0;
  let reorgCount = 0;
  let wakePromise: Promise<void> | null = null;
  let wakeResolve: (() => void) | null = null;

  const armWake = () => {
    wakePromise = new Promise<void>((resolve) => {
      wakeResolve = resolve;
    });
  };
  armWake();

  // Optional WS wake (best-effort, never source of truth)
  let wsCleanup: (() => void) | undefined;
  if (opts.enableWsWake !== false && config.ROBINHOOD_WS_URL) {
    try {
      const { createPublicClient, webSocket } = await import('viem');
      const wsClient = createPublicClient({
        transport: webSocket(config.ROBINHOOD_WS_URL),
      });
      const unwatch = wsClient.watchBlockNumber({
        onBlockNumber: () => {
          wakeResolve?.();
          armWake();
        },
        onError: () => {
          logJson('warn', 'ws wake error — continuing on poll', {
            ws: sanitizeRpcLabel(config.ROBINHOOD_WS_URL),
          });
        },
      });
      wsCleanup = () => {
        try {
          unwatch();
        } catch {
          /* ignore */
        }
      };
      logJson('info', 'ws wake armed', { ws: sanitizeRpcLabel(config.ROBINHOOD_WS_URL) });
    } catch {
      logJson('warn', 'ws wake unavailable — poll only');
    }
  }

  try {
    let watchlist = await withTransaction(pool, (db) =>
      loadWatchlist(db, config.SCOOP_CHAIN_ID),
    );

    while (!stopRequested) {
      if (maxBatches != null && batches >= maxBatches) {
        stopReason = 'maxBatches';
        break;
      }

      const client = rpc.getClient();
      const latest = await rpc.withClient((c) => c.getBlockNumber());
      let safe = latest;
      let finalized = latest;
      try {
        const safeBlock = await rpc.withClient((c) => c.getBlock({ blockTag: 'safe' }));
        safe = safeBlock.number;
      } catch {
        const lag = config.SCOOP_CONFIRM_LAG_BLOCKS ?? 8;
        safe = latest > BigInt(lag) ? latest - BigInt(lag) : 0n;
      }
      try {
        const finalizedBlock = await rpc.withClient((c) =>
          c.getBlock({ blockTag: 'finalized' }),
        );
        finalized = finalizedBlock.number;
      } catch {
        const lag = (config.SCOOP_CONFIRM_LAG_BLOCKS ?? 8) * 2;
        finalized = latest > BigInt(lag) ? latest - BigInt(lag) : 0n;
      }

      const heads: ConfirmationHeads = { latest, safe, finalized };

      const checkpoint = await withTransaction(pool, (db) =>
        getIndexerCheckpoint(db, config.SCOOP_CHAIN_ID, MAIN_STREAM_NAME),
      );
      let nextBlock =
        checkpoint != null
          ? BigInt(checkpoint.lastBlockNumber) + 1n
          : BigInt(config.SCOOP_START_BLOCK);

      // Reorg check
      if (checkpoint != null) {
        const reorgResult = await withTransaction(pool, async (db) =>
          handleReorgIfNeeded(db, {
            chainId: config.SCOOP_CHAIN_ID,
            windowBlocks: config.SCOOP_REORG_WINDOW_BLOCKS,
            latestIndexed: BigInt(checkpoint.lastBlockNumber),
            fetchCanonicalHashes: async (from, to) => {
              const out = [];
              for (let b = from; b <= to; b++) {
                const blk = await rpc.withClient((c) =>
                  c.getBlock({ blockNumber: b, includeTransactions: false }),
                );
                out.push({ blockNumber: b, blockHash: blk.hash! });
              }
              return out;
            },
          }),
        );
        if (reorgResult.reorg && reorgResult.replayFrom != null) {
          reorgCount += 1;
          nextBlock = reorgResult.replayFrom + 1n;
          watchlist = await withTransaction(pool, (db) =>
            loadWatchlist(db, config.SCOOP_CHAIN_ID),
          );
          logJson('warn', 'reorg detected — replaying', {
            replayFrom: reorgResult.replayFrom.toString(),
          });
        }
      }

      const targetHead = safe;
      if (nextBlock > targetHead) {
        await withTransaction(pool, async (db) => {
          await promoteConfirmations(db, { chainId: config.SCOOP_CHAIN_ID, heads });
          await maybeSnapshotQuoteUsd({
            db,
            client,
            chainId: config.SCOOP_CHAIN_ID,
            intervalSeconds: config.SCOOP_QUOTE_SNAPSHOT_SECONDS,
            lastSnapshotAtMs: lastQuoteAtMs,
          }).then((r) => {
            lastQuoteAtMs = r.nextLastAtMs;
          });
          await upsertIndexerHealth(db, {
            chainId: config.SCOOP_CHAIN_ID,
            heartbeatAt: new Date(),
            latestIndexedBlock: checkpoint?.lastBlockNumber ?? null,
            chainLatest: latest,
            chainSafe: safe,
            chainFinalized: finalized,
            lagBlocks: latest - BigInt(checkpoint?.lastBlockNumber ?? 0),
            lastRpcOkAt: new Date(),
            reorgCount,
            dirtyProjections: false,
            watchlistSize: watchlistSize(watchlist),
            activeRpc: rpc.activeLabel(),
            wsConnected: Boolean(wsCleanup),
            notes: 'caught up — waiting for new blocks',
          });
        });

        if (indexToBlock != null && (checkpoint?.lastBlockNumber ?? 0) >= indexToBlock) {
          stopReason = 'indexToBlock';
          break;
        }
        if (headLagTarget >= 0 && maxBatches != null) {
          stopReason = 'caughtUp';
          break;
        }
        if (maxBatches != null) {
          stopReason = 'caughtUp';
          break;
        }

        await Promise.race([
          new Promise((r) => setTimeout(r, config.SCOOP_POLL_INTERVAL_MS)),
          wakePromise,
        ]);
        armWake();
        continue;
      }

      const lagBlocks = targetHead - nextBlock + 1n;
      const useFast = shouldUseFastCatchup(
        lagBlocks,
        config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS,
      );

      const batchEnd = (() => {
        const span = useFast
          ? config.SCOOP_FAST_CATCHUP_RANGE
          : config.SCOOP_MAX_BLOCK_BATCH;
        let end = nextBlock + BigInt(span) - 1n;
        if (end > targetHead) end = targetHead;
        if (indexToBlock != null && end > BigInt(indexToBlock)) end = BigInt(indexToBlock);
        return end;
      })();

      // Finish the current batch even after SIGTERM/SIGINT.
      if (useFast) {
        logJson('info', 'fast catchup batch starting', {
          from: nextBlock.toString(),
          to: batchEnd.toString(),
          lagBlocks: lagBlocks.toString(),
          threshold: config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS,
          range: config.SCOOP_FAST_CATCHUP_RANGE,
        });
        const fastResult = await processFastCatchupRange({
          runInTxn: (fn) => withTransaction(pool, fn),
          client,
          chainId: config.SCOOP_CHAIN_ID,
          fromBlock: nextBlock,
          toBlock: batchEnd,
          watchlist,
          heads,
          dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
          anchorBlocks: config.SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS,
          initialLogRangeSize: config.SCOOP_FAST_CATCHUP_RANGE,
        });
        lastBlock = fastResult.lastBlock;
        for (const result of fastResult.blockResults) {
          if (result.launches > 0 || result.swaps > 0 || result.transfers > 0) {
            logJson('info', 'block processed', {
              mode: 'fast',
              block: result.blockNumber.toString(),
              launches: result.launches,
              swaps: result.swaps,
              transfers: result.transfers,
              duplicate: result.skippedDuplicate,
            });
          }
        }
      } else {
        for (let b = nextBlock; b <= batchEnd; b++) {
          const result = await withTransaction(pool, async (db) =>
            processBlock(db, {
              client,
              chainId: config.SCOOP_CHAIN_ID,
              blockNumber: b,
              watchlist,
              heads,
              dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
            }),
          );
          lastBlock = result.blockNumber;
          if (result.launches > 0 || result.swaps > 0 || result.transfers > 0) {
            logJson('info', 'block processed', {
              mode: 'live',
              block: result.blockNumber.toString(),
              launches: result.launches,
              swaps: result.swaps,
              transfers: result.transfers,
              duplicate: result.skippedDuplicate,
            });
          }
        }
      }

      batches += 1;
      await withTransaction(pool, async (db) => {
        await promoteConfirmations(db, { chainId: config.SCOOP_CHAIN_ID, heads });
        const snap = await maybeSnapshotQuoteUsd({
          db,
          client,
          chainId: config.SCOOP_CHAIN_ID,
          intervalSeconds: config.SCOOP_QUOTE_SNAPSHOT_SECONDS,
          lastSnapshotAtMs: lastQuoteAtMs,
        });
        lastQuoteAtMs = snap.nextLastAtMs;
        await upsertIndexerHealth(db, {
          chainId: config.SCOOP_CHAIN_ID,
          heartbeatAt: new Date(),
          latestIndexedBlock: lastBlock,
          chainLatest: latest,
          chainSafe: safe,
          chainFinalized: finalized,
          lagBlocks: lastBlock != null ? latest - lastBlock : null,
          lastRpcOkAt: new Date(),
          reorgCount,
          dirtyProjections: false,
          watchlistSize: watchlistSize(watchlist),
          activeRpc: rpc.activeLabel(),
          wsConnected: Boolean(wsCleanup),
          notes: useFast ? `fast batch ${batches}` : `live batch ${batches}`,
        });
      });

      if (stopRequested) {
        break;
      }

      if (indexToBlock != null && lastBlock != null && lastBlock >= BigInt(indexToBlock)) {
        stopReason = 'indexToBlock';
        break;
      }
    }
  } finally {
    wsCleanup?.();
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    await pool.end();
    if (lock) {
      await lock.release();
      logJson('info', 'indexer advisory lock released');
    }
  }

  logJson('info', 'indexer runner stopped', {
    batches,
    lastBlock: lastBlock?.toString() ?? null,
    reason: stopReason,
  });

  return { batches, lastBlock, stoppedReason: stopReason };
}
