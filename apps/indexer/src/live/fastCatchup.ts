import { encodeEventTopics, type Hex, type Log, type PublicClient } from 'viem';
import type { Queryable } from '@scoop/db';
import { upsertProcessedBlock, upsertIndexerCheckpoint } from '@scoop/db';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import { normalizeAddress, normalizeBytes32 } from '@scoop/shared';
import { MAIN_STREAM_NAME } from '../config.js';
import { processBlock, type ProcessBlockResult } from './processBlock.js';
import type { Watchlist } from './watchlist.js';
import type { ConfirmationHeads } from './confirmations.js';

/** Canonical P3 TokenLaunched topic. */
export const TOKEN_LAUNCHED_TOPIC = encodeEventTopics({
  abi: scoopAbis.ScoopFactory,
  eventName: 'TokenLaunched',
})[0] as Hex;

/** Historical HELLO canary TokenLaunched topic. */
export const TOKEN_LAUNCHED_TOPIC_HISTORICAL = encodeEventTopics({
  abi: scoopAbis.ScoopFactoryHistoricalCanary,
  eventName: 'TokenLaunched',
})[0] as Hex;

export interface FastCatchupConfig {
  rangeBlocks: number;
  thresholdBlocks: number;
  /** Persist hash anchors every N empty blocks (plus range endpoints). */
  anchorBlocks: number;
}

export interface FastCatchupStats {
  mode: 'fast';
  fromBlock: bigint;
  toBlock: bigint;
  blocksSpanned: number;
  interestingBlocks: number;
  emptyBlocksAdvanced: number;
  anchorsWritten: number;
  launches: number;
  swaps: number;
  transfers: number;
  getLogsCalls: number;
  getBlockCalls: number;
  processBlockCalls: number;
  rangeReductions: number;
  rescans: number;
  finalRangeSize: number;
}

export interface FastCatchupResult {
  lastBlock: bigint;
  stats: FastCatchupStats;
  blockResults: ProcessBlockResult[];
}

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

/**
 * Address filters for fast-catchup range eth_getLogs.
 * Intentionally omits PoolManager: it emits chain-wide noise and would mark nearly
 * every block interesting. Watched token Transfers still surface swap blocks;
 * processBlock then fetches PoolManager logs for those blocks only.
 */
export function buildLogAddressFilters(watchlist: Watchlist): Hex[] {
  const factory = normalizeAddress(scoopV1MainnetCanaryManifest.contracts.ScoopFactory);
  const creatorRewards = normalizeAddress(
    scoopV1MainnetCanaryManifest.contracts.ScoopCreatorRewards,
  );
  const addresses = [
    factory,
    creatorRewards,
    ...watchlist.tokenAddresses,
    ...watchlist.distributorAddresses,
  ];
  return [...new Set(addresses)] as Hex[];
}

export function shouldUseFastCatchup(
  lagBlocks: bigint,
  thresholdBlocks: number,
): boolean {
  return lagBlocks > BigInt(thresholdBlocks);
}

/** Sorted unique block numbers that contain filtered logs. */
export function interestingBlocksFromLogs(
  logs: Array<{ blockNumber: bigint | null | undefined }>,
): bigint[] {
  const set = new Set<string>();
  for (const log of logs) {
    if (log.blockNumber == null) continue;
    set.add(log.blockNumber.toString());
  }
  return [...set].map((s) => BigInt(s)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function addressFilterKey(addresses: Hex[]): string {
  return [...addresses].map((a) => normalizeAddress(a)).sort().join(',');
}

/**
 * Anchor block numbers for empty range [from, to] inclusive.
 * Always includes endpoints; steps by anchorBlocks.
 */
export function planEmptyRangeAnchors(
  fromBlock: bigint,
  toBlock: bigint,
  anchorBlocks: number,
): bigint[] {
  if (toBlock < fromBlock) return [];
  const step = BigInt(Math.max(1, anchorBlocks));
  const out: bigint[] = [];
  const seen = new Set<string>();
  const push = (b: bigint) => {
    const k = b.toString();
    if (seen.has(k)) return;
    if (b < fromBlock || b > toBlock) return;
    seen.add(k);
    out.push(b);
  };
  push(fromBlock);
  for (let b = fromBlock + step; b < toBlock; b += step) {
    push(b);
  }
  push(toBlock);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function isRangeTooLargeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('block range') ||
    lower.includes('query returned more than') ||
    lower.includes('response size') ||
    lower.includes('exceeds max') ||
    lower.includes('too many') ||
    lower.includes('limit exceeded') ||
    lower.includes('range is too large') ||
    lower.includes('-32602') ||
    lower.includes('-32005') ||
    lower.includes('10 block range') ||
    lower.includes('size limit') ||
    lower.includes('exceeded the size limit') ||
    /\blog\s*response\b/.test(lower)
  );
}

export interface GetLogsRangeResult {
  logs: Log[];
  fromBlock: bigint;
  toBlock: bigint;
  rangeSize: number;
  reductions: number;
  calls: number;
}

/**
 * Fetch logs for [from, to], shrinking the range on provider rejection.
 * Never skips: walks the full span via successive windows.
 */
export async function getLogsWithRangeReduction(
  client: PublicClient,
  args: {
    fromBlock: bigint;
    toBlock: bigint;
    address: Hex[];
    initialRangeSize: number;
    onReduce?: (prev: number, next: number, errorMessage: string) => void;
  },
): Promise<GetLogsRangeResult> {
  const allLogs: Log[] = [];
  let cursor = args.fromBlock;
  let windowSize = Math.max(1, args.initialRangeSize);
  let reductions = 0;
  let calls = 0;
  let finalRangeSize = windowSize;

  while (cursor <= args.toBlock) {
    const windowEnd =
      cursor + BigInt(windowSize) - 1n > args.toBlock
        ? args.toBlock
        : cursor + BigInt(windowSize) - 1n;

    try {
      calls += 1;
      const logs = await client.getLogs({
        fromBlock: cursor,
        toBlock: windowEnd,
        address: args.address.length > 0 ? args.address : undefined,
      });
      allLogs.push(...logs);
      finalRangeSize = windowSize;
      cursor = windowEnd + 1n;
    } catch (error) {
      if (!isRangeTooLargeError(error) || windowSize <= 1) {
        throw error;
      }
      const nextSize = Math.max(1, Math.floor(windowSize / 2));
      reductions += 1;
      args.onReduce?.(
        windowSize,
        nextSize,
        error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
      );
      windowSize = nextSize;
    }
  }

  return {
    logs: allLogs,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
    rangeSize: finalRangeSize,
    reductions,
    calls,
  };
}

/**
 * Persist sparse processed_blocks anchors and advance checkpoint to toBlock.
 * Does not connect beyond getBlock for anchors — no log ingest.
 */
export async function advanceEmptyRange(
  db: Queryable,
  args: {
    client: PublicClient;
    chainId: number;
    fromBlock: bigint;
    toBlock: bigint;
    anchorBlocks: number;
    streamName?: string;
    fetchBlock?: (blockNumber: bigint) => Promise<{
      hash: Hex;
      parentHash: Hex;
      timestamp: bigint;
    }>;
  },
): Promise<{ anchorsWritten: number; getBlockCalls: number }> {
  if (args.toBlock < args.fromBlock) {
    return { anchorsWritten: 0, getBlockCalls: 0 };
  }

  const streamName = args.streamName ?? MAIN_STREAM_NAME;
  const anchors = planEmptyRangeAnchors(args.fromBlock, args.toBlock, args.anchorBlocks);
  const fetchBlock =
    args.fetchBlock ??
    (async (blockNumber: bigint) => {
      const block = await args.client.getBlock({
        blockNumber,
        includeTransactions: false,
      });
      return {
        hash: block.hash!,
        parentHash: block.parentHash,
        timestamp: block.timestamp,
      };
    });

  let getBlockCalls = 0;
  let endHash: string | null = null;

  for (const blockNumber of anchors) {
    getBlockCalls += 1;
    const block = await fetchBlock(blockNumber);
    const blockHash = normalizeBytes32(block.hash);
    const parentHash = normalizeBytes32(block.parentHash);
    await upsertProcessedBlock(db, {
      chainId: args.chainId,
      blockNumber,
      blockHash,
      parentHash,
      blockTimestamp: block.timestamp,
    });
    if (blockNumber === args.toBlock) {
      endHash = blockHash;
    }
  }

  if (endHash == null) {
    getBlockCalls += 1;
    const end = await fetchBlock(args.toBlock);
    endHash = normalizeBytes32(end.hash);
    await upsertProcessedBlock(db, {
      chainId: args.chainId,
      blockNumber: args.toBlock,
      blockHash: endHash,
      parentHash: normalizeBytes32(end.parentHash),
      blockTimestamp: end.timestamp,
    });
  }

  await upsertIndexerCheckpoint(db, {
    chainId: args.chainId,
    streamName,
    lastBlockNumber: args.toBlock,
    lastBlockHash: endHash,
    lastLogIndex: -1,
  });

  return { anchorsWritten: anchors.length, getBlockCalls };
}

/**
 * Historical fast catch-up for one contiguous range [fromBlock, toBlock].
 * Range-scans eth_getLogs, processes only interesting blocks via processBlock,
 * advances sparse checkpoints across empty spans, rescans after TokenLaunched.
 *
 * Each processBlock / empty advance runs in its own DB transaction via runInTxn.
 */
export async function processFastCatchupRange(args: {
  runInTxn: <T>(fn: (db: Queryable) => Promise<T>) => Promise<T>;
  client: PublicClient;
  chainId: number;
  fromBlock: bigint;
  toBlock: bigint;
  watchlist: Watchlist;
  heads?: ConfirmationHeads;
  dustRaw?: bigint;
  quoteUsdMaxAgeSeconds?: number;
  streamName?: string;
  anchorBlocks: number;
  initialLogRangeSize: number;
  /** Injected for tests — default uses client.getLogs with reduction. */
  fetchLogs?: (from: bigint, to: bigint, address: Hex[]) => Promise<GetLogsRangeResult>;
  /** Injected for tests — default processBlock inside runInTxn. */
  processOneBlock?: (blockNumber: bigint) => Promise<ProcessBlockResult>;
  /** Injected for tests — default advanceEmptyRange inside runInTxn. */
  advanceEmpty?: (
    from: bigint,
    to: bigint,
  ) => Promise<{ anchorsWritten: number; getBlockCalls: number }>;
}): Promise<FastCatchupResult> {
  if (args.toBlock < args.fromBlock) {
    throw new Error('processFastCatchupRange: toBlock < fromBlock');
  }

  const stats: FastCatchupStats = {
    mode: 'fast',
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
    blocksSpanned: Number(args.toBlock - args.fromBlock + 1n),
    interestingBlocks: 0,
    emptyBlocksAdvanced: 0,
    anchorsWritten: 0,
    launches: 0,
    swaps: 0,
    transfers: 0,
    getLogsCalls: 0,
    getBlockCalls: 0,
    processBlockCalls: 0,
    rangeReductions: 0,
    rescans: 0,
    finalRangeSize: args.initialLogRangeSize,
  };

  const fetchLogs =
    args.fetchLogs ??
    ((from: bigint, to: bigint, address: Hex[]) =>
      getLogsWithRangeReduction(args.client, {
        fromBlock: from,
        toBlock: to,
        address,
        initialRangeSize: Math.min(
          args.initialLogRangeSize,
          Number(to - from + 1n),
        ),
        onReduce: (prev, next, errorMessage) => {
          logJson('warn', 'fast catchup getLogs range reduced', {
            previousRange: prev,
            nextRange: next,
            error: errorMessage,
          });
        },
      }));

  const processOneBlock =
    args.processOneBlock ??
    ((blockNumber: bigint) =>
      args.runInTxn((db) =>
        processBlock(db, {
          client: args.client,
          chainId: args.chainId,
          blockNumber,
          watchlist: args.watchlist,
          heads: args.heads,
          dustRaw: args.dustRaw,
          quoteUsdMaxAgeSeconds: args.quoteUsdMaxAgeSeconds,
          streamName: args.streamName,
        }),
      ));

  const advanceEmpty =
    args.advanceEmpty ??
    ((from: bigint, to: bigint) =>
      args.runInTxn((db) =>
        advanceEmptyRange(db, {
          client: args.client,
          chainId: args.chainId,
          fromBlock: from,
          toBlock: to,
          anchorBlocks: args.anchorBlocks,
          streamName: args.streamName,
        }),
      ));

  let addresses = buildLogAddressFilters(args.watchlist);
  let filterKey = addressFilterKey(addresses);

  const pending = new Set<string>();
  const blockResults: ProcessBlockResult[] = [];

  const ingestLogs = async (from: bigint, to: bigint, isRescan: boolean) => {
    if (to < from) return;
    const result = await fetchLogs(from, to, addresses);
    stats.getLogsCalls += result.calls;
    stats.rangeReductions += result.reductions;
    stats.finalRangeSize = result.rangeSize;
    if (isRescan) stats.rescans += 1;
    for (const b of interestingBlocksFromLogs(result.logs)) {
      pending.add(b.toString());
    }
  };

  await ingestLogs(args.fromBlock, args.toBlock, false);

  let cursor = args.fromBlock - 1n;

  while (cursor < args.toBlock) {
    const nextInteresting = [...pending]
      .map((s) => BigInt(s))
      .filter((b) => b > cursor && b <= args.toBlock)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];

    if (nextInteresting == null) {
      const emptyFrom = cursor + 1n;
      if (emptyFrom <= args.toBlock) {
        const adv = await advanceEmpty(emptyFrom, args.toBlock);
        stats.anchorsWritten += adv.anchorsWritten;
        stats.getBlockCalls += adv.getBlockCalls;
        stats.emptyBlocksAdvanced += Number(args.toBlock - emptyFrom + 1n);
      }
      cursor = args.toBlock;
      break;
    }

    const emptyFrom = cursor + 1n;
    if (emptyFrom < nextInteresting) {
      const emptyTo = nextInteresting - 1n;
      const adv = await advanceEmpty(emptyFrom, emptyTo);
      stats.anchorsWritten += adv.anchorsWritten;
      stats.getBlockCalls += adv.getBlockCalls;
      stats.emptyBlocksAdvanced += Number(emptyTo - emptyFrom + 1n);
    }

    pending.delete(nextInteresting.toString());
    const result = await processOneBlock(nextInteresting);
    stats.processBlockCalls += 1;
    stats.interestingBlocks += 1;
    stats.launches += result.launches;
    stats.swaps += result.swaps;
    stats.transfers += result.transfers;
    // processBlock also issues getBlock + getLogs; count getBlock toward observability
    stats.getBlockCalls += 1;
    blockResults.push(result);
    cursor = nextInteresting;

    if (result.launches > 0) {
      addresses = buildLogAddressFilters(args.watchlist);
      const nextKey = addressFilterKey(addresses);
      if (nextKey !== filterKey) {
        filterKey = nextKey;
        // Deterministic rescan of the remainder with expanded filters.
        await ingestLogs(nextInteresting + 1n, args.toBlock, true);
      }
    }
  }

  stats.interestingBlocks = blockResults.length;

  logJson('info', 'fast catchup range complete', {
    from: args.fromBlock.toString(),
    to: args.toBlock.toString(),
    interestingBlocks: stats.interestingBlocks,
    emptyBlocksAdvanced: stats.emptyBlocksAdvanced,
    anchorsWritten: stats.anchorsWritten,
    getLogsCalls: stats.getLogsCalls,
    getBlockCalls: stats.getBlockCalls,
    rangeReductions: stats.rangeReductions,
    rescans: stats.rescans,
    launches: stats.launches,
    swaps: stats.swaps,
    transfers: stats.transfers,
  });

  return {
    lastBlock: args.toBlock,
    stats,
    blockResults,
  };
}
