import {
  createPool,
  withTransaction,
  getIndexerCheckpoint,
  getLiveObserverCheckpoint,
  upsertIndexerHealth,
  expireLiveOverlayRows,
  deleteConfirmedLiveRows,
} from '@scoop/db';
import type { IndexerConfig } from '../config.js';
import {
  MAIN_STREAM_NAME,
  publicConfigView,
  resolveIndexerLockDatabaseUrl,
  sanitizeRpcLabel,
} from '../config.js';
import { createFailoverRpc } from './rpc/failover.js';
import { loadWatchlist, watchlistSize } from './watchlist.js';
import { processBlock } from './processBlock.js';
import { processFastCatchupRange, shouldUseFastCatchup } from './fastCatchup.js';
import { handleReorgIfNeeded } from './reorg.js';
import { promoteConfirmations, type ConfirmationHeads } from './confirmations.js';
import {
  resolveConfirmLagBlocks,
  resolveTargetHead,
  type ConfirmMode,
} from './targetHead.js';
import { maybeSnapshotQuoteUsd } from './quoteSnapshot.js';
import { maybeExpireStale24hVolume } from './projections/expire24hVolume.js';
import {
  acquireIndexerAdvisoryLock,
  assertMigrationCompatibilityFromPool,
  type AdvisoryLockHandle,
} from './guardrails.js';
import { startLiveTipOverlay } from './tipOverlay/observer.js';
import {
  computeBehindTargetBlocks,
  computeEffectiveBlocksPerSecond,
  formatCanonicalHealthNotes,
  logCanonicalThroughput,
  type CanonicalLoopMode,
} from './canonicalMetrics.js';

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

  const lockDatabaseUrl = resolveIndexerLockDatabaseUrl(config);
  let lockSessionLost = false;
  let stopRequested = false;
  let stopReason = 'running';
  let lock: AdvisoryLockHandle | null = null;
  const overlayAbort = new AbortController();
  try {
    lock = await acquireIndexerAdvisoryLock({
      databaseUrl: lockDatabaseUrl,
      retryMs: config.INDEXER_LOCK_RETRY_MS,
      waitTimeoutMs: config.INDEXER_LOCK_WAIT_TIMEOUT_MS,
      onRetry: ({ attempt, waitedMs, remainingMs }) => {
        // Concise progress — one log per retry interval, not a tight spam loop.
        logJson('info', 'indexer singleton lock busy — waiting for prior owner', {
          attempt,
          waitedMs,
          remainingMs,
          retryMs: config.INDEXER_LOCK_RETRY_MS,
        });
      },
      onLockSessionLost: () => {
        lockSessionLost = true;
        stopRequested = true;
        stopReason = 'lock_session_lost';
        overlayAbort.abort();
        logJson('error', 'indexer dedicated lock session lost — stopping safely', {
          key: "hashtext('scoop_indexer')",
        });
      },
    });
  } catch (error) {
    logJson('error', 'indexer singleton lock failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  logJson('info', 'indexer advisory lock acquired', {
    key: "hashtext('scoop_indexer')",
    lockConnection: 'dedicated',
  });

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

  const onSignal = (sig: string) => {
    stopRequested = true;
    stopReason = sig;
    overlayAbort.abort();
    logJson('info', 'shutdown signal received — finishing current batch', { signal: sig });
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  let batches = 0;
  let lastBlock: bigint | null = null;
  let lastQuoteAtMs = 0;
  let lastVolumeSweepAtMs = 0;
  let lastLiveCleanupAtMs = 0;
  let reorgCount = 0;
  let wakePromise: Promise<void> | null = null;
  let wakeResolve: (() => void) | null = null;

  const armWake = () => {
    wakePromise = new Promise<void>((resolve) => {
      wakeResolve = resolve;
    });
  };
  armWake();

  const overlayPromise = config.SCOOP_LIVE_OVERLAY_ENABLED
    ? startLiveTipOverlay({ config, pool, signal: overlayAbort.signal }).catch((error) => {
        logJson('warn', 'live overlay stopped unexpectedly — canonical continuing', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
    : Promise.resolve();

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
      const confirmMode = config.SCOOP_CONFIRM_MODE as ConfirmMode;
      const confirmLagBlocks = resolveConfirmLagBlocks(
        confirmMode,
        config.SCOOP_CONFIRM_LAG_BLOCKS,
      );
      const targetHead = resolveTargetHead({
        mode: confirmMode,
        heads,
        confirmLagBlocks,
      });

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
            quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
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

      if (nextBlock > targetHead) {
        const indexed = BigInt(checkpoint?.lastBlockNumber ?? 0);
        // Re-sample tip so idle health cannot claim caught-up against a stale latest.
        const freshLatest = await rpc.withClient((c) => c.getBlockNumber());
        const freshHeads: ConfirmationHeads = {
          latest: freshLatest,
          safe,
          finalized,
        };
        const freshTarget = resolveTargetHead({
          mode: confirmMode,
          heads: freshHeads,
          confirmLagBlocks,
        });
        const behindTarget = computeBehindTargetBlocks({
          targetHead: freshTarget,
          checkpoint: indexed,
        });

        // Tip moved while we thought we were caught up — skip idle maintenance
        // (quote/volume/overlay) and catch up immediately. Prod tip can advance
        // ~20–40 blocks during that work + 2s poll, which kept behindTarget ~45.
        if (behindTarget > 0n) {
          logCanonicalThroughput({
            mode: 'normal-batch',
            latestBlock: freshLatest,
            targetHead: freshTarget,
            checkpoint: indexed,
            behindTargetBlocks: behindTarget,
            latestLagBlocks:
              freshLatest > indexed ? freshLatest - indexed : 0n,
            blocksAttempted: 0,
            blocksProcessed: 0,
            interestingBlocks: 0,
            emptyBlocksOrSpans: 0,
            rpcMs: 0,
            decodeMs: 0,
            writeMs: 0,
            loopMs: 0,
            effectiveBlocksPerSecond: 0,
            rpcRetries: 0,
            confirmMode,
            confirmLagBlocks,
            liveLagBlocks: null,
          });
          continue;
        }

        await withTransaction(pool, async (db) => {
          const promoted = await promoteConfirmations(db, {
            chainId: config.SCOOP_CHAIN_ID,
            heads: freshHeads,
          });
          if (promoted.rawUpdated > 0) {
            logJson('info', 'confirmation promotion', {
              rawUpdated: promoted.rawUpdated,
              tradesUpdated: promoted.tradesUpdated,
              safe: safe.toString(),
              finalized: finalized.toString(),
            });
          }
          await maybeSnapshotQuoteUsd({
            db,
            client,
            chainId: config.SCOOP_CHAIN_ID,
            intervalSeconds: config.SCOOP_QUOTE_SNAPSHOT_SECONDS,
            lastSnapshotAtMs: lastQuoteAtMs,
          }).then((r) => {
            lastQuoteAtMs = r.nextLastAtMs;
          });
          await maybeExpireStale24hVolume({
            db,
            chainId: config.SCOOP_CHAIN_ID,
            intervalSeconds: config.SCOOP_VOLUME_24H_SWEEP_SECONDS,
            lastSweepAtMs: lastVolumeSweepAtMs,
            quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
            dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
          }).then((r) => {
            lastVolumeSweepAtMs = r.nextLastAtMs;
            if (r.swept && (r.refreshed > 0 || r.failed > 0)) {
              logJson('info', '24h volume sweep', {
                candidates: r.candidates,
                refreshed: r.refreshed,
                failed: r.failed,
              });
            }
          });
          if (
            config.SCOOP_LIVE_OVERLAY_ENABLED &&
            Date.now() - lastLiveCleanupAtMs >= 60_000
          ) {
            await expireLiveOverlayRows(db, config.SCOOP_CHAIN_ID);
            await deleteConfirmedLiveRows(db, config.SCOOP_CHAIN_ID);
            lastLiveCleanupAtMs = Date.now();
          }
          const liveCheckpoint = config.SCOOP_LIVE_OVERLAY_ENABLED
            ? await getLiveObserverCheckpoint(db, config.SCOOP_CHAIN_ID)
            : null;
          const liveLag =
            liveCheckpoint != null && freshLatest > BigInt(liveCheckpoint)
              ? freshLatest - BigInt(liveCheckpoint)
              : 0n;
          const idleSnapshot = {
            mode: 'idle' as CanonicalLoopMode,
            latestBlock: freshLatest,
            targetHead: freshTarget,
            checkpoint: indexed,
            behindTargetBlocks: behindTarget,
            latestLagBlocks:
              freshLatest > indexed ? freshLatest - indexed : 0n,
            blocksAttempted: 0,
            blocksProcessed: 0,
            interestingBlocks: 0,
            emptyBlocksOrSpans: 0,
            rpcMs: 0,
            decodeMs: 0,
            writeMs: 0,
            loopMs: 0,
            effectiveBlocksPerSecond: 0,
            rpcRetries: 0,
            confirmMode,
            confirmLagBlocks,
            liveLagBlocks: config.SCOOP_LIVE_OVERLAY_ENABLED ? liveLag : null,
          };
          logCanonicalThroughput(idleSnapshot);
          await upsertIndexerHealth(db, {
            chainId: config.SCOOP_CHAIN_ID,
            heartbeatAt: new Date(),
            latestIndexedBlock: checkpoint?.lastBlockNumber ?? null,
            chainLatest: freshLatest,
            chainSafe: safe,
            chainFinalized: finalized,
            lagBlocks: behindTarget,
            lastRpcOkAt: new Date(),
            reorgCount,
            dirtyProjections: false,
            watchlistSize: watchlistSize(watchlist),
            activeRpc: rpc.activeLabel(),
            wsConnected: Boolean(wsCleanup),
            notes: formatCanonicalHealthNotes(idleSnapshot),
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
          // Hard-cap idle poll so a dashboard override of 2000ms cannot let tip
          // race ~40+ blocks ahead between wakes (RHC often ≥10–20 blk/s).
          new Promise((r) =>
            setTimeout(r, Math.min(config.SCOOP_POLL_INTERVAL_MS, 500)),
          ),
          wakePromise,
        ]);
        armWake();
        continue;
      }

      const lagBlocks = targetHead - nextBlock + 1n;
      // Hard-cap threshold at 0 so any lag uses proven range catch-up.
      // Dashboard overrides (64/5000) previously stranded moderate lag in slow
      // per-block mode (~2–4 blk/s) while tip runs ~10–20+ blk/s.
      const rangeThreshold = Math.min(
        config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS,
        0,
      );
      const useFast = shouldUseFastCatchup(lagBlocks, rangeThreshold);

      const batchEnd = (() => {
        const liveBatch = Math.min(config.SCOOP_MAX_BLOCK_BATCH, 48);
        const span = useFast ? config.SCOOP_FAST_CATCHUP_RANGE : liveBatch;
        let end = nextBlock + BigInt(span) - 1n;
        if (end > targetHead) end = targetHead;
        if (indexToBlock != null && end > BigInt(indexToBlock)) end = BigInt(indexToBlock);
        return end;
      })();

      const loopStarted = Date.now();
      let interestingBlocks = 0;
      let emptyBlocksOrSpans = 0;
      let rpcMs = 0;
      let writeMs = 0;

      // Finish the current batch even after SIGTERM/SIGINT.
      if (useFast) {
        logJson('info', 'fast catchup batch starting', {
          from: nextBlock.toString(),
          to: batchEnd.toString(),
          lagBlocks: lagBlocks.toString(),
          targetHead: targetHead.toString(),
          confirmMode,
          confirmLagBlocks,
          threshold: rangeThreshold,
          configuredThreshold: config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS,
          range: config.SCOOP_FAST_CATCHUP_RANGE,
        });
        const rpcStarted = Date.now();
        const fastResult = await processFastCatchupRange({
          runInTxn: (fn) => withTransaction(pool, fn),
          client,
          chainId: config.SCOOP_CHAIN_ID,
          fromBlock: nextBlock,
          toBlock: batchEnd,
          watchlist,
          heads,
          dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
          quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
          anchorBlocks: config.SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS,
          initialLogRangeSize: config.SCOOP_FAST_CATCHUP_RANGE,
        });
        rpcMs = Date.now() - rpcStarted;
        lastBlock = fastResult.lastBlock;
        interestingBlocks = fastResult.stats.interestingBlocks;
        emptyBlocksOrSpans = fastResult.stats.emptyBlocksAdvanced;
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
        const writeStarted = Date.now();
        for (let b = nextBlock; b <= batchEnd; b++) {
          const result = await withTransaction(pool, async (db) =>
            processBlock(db, {
              client,
              chainId: config.SCOOP_CHAIN_ID,
              blockNumber: b,
              watchlist,
              heads,
              dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
              quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
            }),
          );
          lastBlock = result.blockNumber;
          if (result.launches > 0 || result.swaps > 0 || result.transfers > 0) {
            interestingBlocks += 1;
            logJson('info', 'block processed', {
              mode: 'live',
              block: result.blockNumber.toString(),
              launches: result.launches,
              swaps: result.swaps,
              transfers: result.transfers,
              duplicate: result.skippedDuplicate,
            });
          } else {
            emptyBlocksOrSpans += 1;
          }
        }
        writeMs = Date.now() - writeStarted;
      }

      batches += 1;
      const loopMs = Date.now() - loopStarted;
      const blocksSpanned = Number(batchEnd - nextBlock + 1n);

      // Fresh tip sample outside the DB txn so lag cannot look "caught up" after a slow batch.
      const freshLatest = await rpc.withClient((c) => c.getBlockNumber());
      const freshTarget = resolveTargetHead({
        mode: confirmMode,
        heads: { latest: freshLatest, safe, finalized },
        confirmLagBlocks,
      });
      const indexed = lastBlock ?? 0n;
      const behindTarget = computeBehindTargetBlocks({
        targetHead: freshTarget,
        checkpoint: indexed,
      });

      await withTransaction(pool, async (db) => {
        const promoted = await promoteConfirmations(db, {
          chainId: config.SCOOP_CHAIN_ID,
          heads,
        });
        if (promoted.rawUpdated > 0) {
          logJson('info', 'confirmation promotion', {
            rawUpdated: promoted.rawUpdated,
            tradesUpdated: promoted.tradesUpdated,
            safe: safe.toString(),
            finalized: finalized.toString(),
          });
        }
        const snap = await maybeSnapshotQuoteUsd({
          db,
          client,
          chainId: config.SCOOP_CHAIN_ID,
          intervalSeconds: config.SCOOP_QUOTE_SNAPSHOT_SECONDS,
          lastSnapshotAtMs: lastQuoteAtMs,
        });
        lastQuoteAtMs = snap.nextLastAtMs;
        const volSweep = await maybeExpireStale24hVolume({
          db,
          chainId: config.SCOOP_CHAIN_ID,
          intervalSeconds: config.SCOOP_VOLUME_24H_SWEEP_SECONDS,
          lastSweepAtMs: lastVolumeSweepAtMs,
          quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
          dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
        });
        lastVolumeSweepAtMs = volSweep.nextLastAtMs;
        if (volSweep.swept && (volSweep.refreshed > 0 || volSweep.failed > 0)) {
          logJson('info', '24h volume sweep', {
            candidates: volSweep.candidates,
            refreshed: volSweep.refreshed,
            failed: volSweep.failed,
          });
        }

        const liveCheckpoint = config.SCOOP_LIVE_OVERLAY_ENABLED
          ? await getLiveObserverCheckpoint(db, config.SCOOP_CHAIN_ID)
          : null;
        const liveLag =
          liveCheckpoint != null && freshLatest > BigInt(liveCheckpoint)
            ? freshLatest - BigInt(liveCheckpoint)
            : 0n;
        const mode: CanonicalLoopMode = useFast ? 'range-catchup' : 'normal-batch';
        const throughput = {
          mode,
          latestBlock: freshLatest,
          targetHead: freshTarget,
          checkpoint: indexed,
          behindTargetBlocks: behindTarget,
          latestLagBlocks: freshLatest > indexed ? freshLatest - indexed : 0n,
          batchStart: nextBlock,
          batchEnd,
          blocksAttempted: blocksSpanned,
          blocksProcessed: blocksSpanned,
          interestingBlocks,
          emptyBlocksOrSpans,
          rpcMs,
          decodeMs: 0,
          writeMs,
          loopMs,
          effectiveBlocksPerSecond: computeEffectiveBlocksPerSecond({
            blocksSpanned,
            loopMs,
          }),
          rpcRetries: 0,
          confirmMode,
          confirmLagBlocks,
          liveLagBlocks: config.SCOOP_LIVE_OVERLAY_ENABLED ? liveLag : null,
        };
        logCanonicalThroughput(throughput);
        await upsertIndexerHealth(db, {
          chainId: config.SCOOP_CHAIN_ID,
          heartbeatAt: new Date(),
          latestIndexedBlock: lastBlock,
          chainLatest: freshLatest,
          chainSafe: safe,
          chainFinalized: finalized,
          lagBlocks: behindTarget,
          lastRpcOkAt: new Date(),
          reorgCount,
          dirtyProjections: false,
          watchlistSize: watchlistSize(watchlist),
          activeRpc: rpc.activeLabel(),
          wsConnected: Boolean(wsCleanup),
          notes: formatCanonicalHealthNotes(throughput),
        });
      });

      if (stopRequested || lockSessionLost) {
        break;
      }

      if (indexToBlock != null && lastBlock != null && lastBlock >= BigInt(indexToBlock)) {
        stopReason = 'indexToBlock';
        break;
      }
    }
  } finally {
    overlayAbort.abort();
    await overlayPromise;
    wsCleanup?.();
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    // Unlock + close dedicated lock session before pooled DB resources.
    if (lock) {
      await lock.release();
      logJson('info', 'indexer advisory lock released');
    }
    await pool.end();
  }

  if (lockSessionLost) {
    throw new Error(
      'Indexer dedicated lock session lost; refusing to continue without singleton ownership. Exit non-zero.',
    );
  }

  logJson('info', 'indexer runner stopped', {
    batches,
    lastBlock: lastBlock?.toString() ?? null,
    reason: stopReason,
  });

  return { batches, lastBlock, stoppedReason: stopReason };
}
