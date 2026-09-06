import { describe, expect, it } from 'vitest';
import type { Hex, Log, PublicClient } from 'viem';
import { loadConfig, publicConfigView } from '../config.js';
import {
  addressFilterKey,
  advanceEmptyRange,
  buildLogAddressFilters,
  getLogsWithRangeReduction,
  interestingBlocksFromLogs,
  planEmptyRangeAnchors,
  processFastCatchupRange,
  shouldUseFastCatchup,
  TOKEN_LAUNCHED_TOPIC,
} from './fastCatchup.js';
import { watchlistAddLaunch, type Watchlist } from './watchlist.js';
import { ZERO_ADDRESS } from '@scoop/shared';

function emptyWatchlist(): Watchlist {
  return {
    tokens: new Map(),
    pools: new Map(),
    distributors: new Map(),
    lockers: new Set(),
    tokenAddresses: [],
    distributorAddresses: [],
  };
}

function fakeLog(blockNumber: bigint, address: Hex = '0xabc'): Log {
  return {
    address,
    blockNumber,
    blockHash: `0x${'1'.repeat(64)}`,
    transactionHash: `0x${'2'.repeat(64)}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
    data: '0x',
    topics: [],
  } as Log;
}

describe('fast catchup helpers', () => {
  it('exposes fast catchup config defaults', () => {
    const config = loadConfig({ SCOOP_CHAIN_ID: '4663' });
    expect(config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS).toBe(5000);
    expect(config.SCOOP_FAST_CATCHUP_RANGE).toBe(5000);
    expect(config.SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS).toBe(64);
    const view = publicConfigView(config);
    expect(view.fastCatchupThresholdBlocks).toBe(5000);
    expect(view.fastCatchupRange).toBe(5000);
  });

  it('enters fast mode only when lag exceeds threshold', () => {
    expect(shouldUseFastCatchup(5000n, 5000)).toBe(false);
    expect(shouldUseFastCatchup(5001n, 5000)).toBe(true);
    expect(shouldUseFastCatchup(100n, 5000)).toBe(false);
  });

  it('plans empty-range anchors with endpoints', () => {
    expect(planEmptyRangeAnchors(100n, 100n, 64)).toEqual([100n]);
    expect(planEmptyRangeAnchors(100n, 228n, 64)).toEqual([100n, 164n, 228n]);
    expect(planEmptyRangeAnchors(10n, 9n, 64)).toEqual([]);
  });

  it('collects interesting blocks from logs', () => {
    const blocks = interestingBlocksFromLogs([
      fakeLog(10n),
      fakeLog(12n),
      fakeLog(10n),
      fakeLog(11n),
    ]);
    expect(blocks).toEqual([10n, 11n, 12n]);
  });

  it('builds static+dynamic address filters without PoolManager noise', () => {
    const wl = emptyWatchlist();
    const base = buildLogAddressFilters(wl);
    expect(base.length).toBeGreaterThanOrEqual(2);
    const poolManager =
      '0x8366a39cc670b4001a1121b8f6a443a643e40951';
    expect(base.map((a) => a.toLowerCase()).includes(poolManager)).toBe(false);

    watchlistAddLaunch(wl, {
      chainId: 4663,
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      poolId: `0x${'a'.repeat(64)}`,
      feeDistributorAddress: '0x1111111111111111111111111111111111111111',
      liquidityLockerAddress: '0x2222222222222222222222222222222222222222',
      quoteAsset: ZERO_ADDRESS,
      factoryAddress: '0x15E874Bc667435ddbF2a67c0362701DC23C90833',
      deployerAddress: '0x3333333333333333333333333333333333333333',
      creatorId: `0x${'b'.repeat(64)}`,
      tickLower: -100,
      tickUpper: 100,
      openingSqrtPriceX96: '1',
      lpTokenId: '1',
      currency0: ZERO_ADDRESS,
      currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      fee: 10000,
      tickSpacing: 10,
      hooks: ZERO_ADDRESS,
    });
    const expanded = buildLogAddressFilters(wl);
    expect(expanded.length).toBeGreaterThan(base.length);
    expect(addressFilterKey(expanded)).not.toBe(addressFilterKey(base));
    expect(expanded.map((a) => a.toLowerCase()).includes(poolManager)).toBe(false);
    expect(TOKEN_LAUNCHED_TOPIC.startsWith('0x')).toBe(true);
  });
});

describe('getLogsWithRangeReduction', () => {
  it('reduces range on provider rejection and never skips span', async () => {
    const calls: Array<{ from: bigint; to: bigint }> = [];
    let attempt = 0;
    const client = {
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push({ from: fromBlock, to: toBlock });
        attempt += 1;
        if (attempt === 1 && toBlock - fromBlock + 1n > 100n) {
          throw new Error('block range too large');
        }
        return [] as Log[];
      },
    } as unknown as PublicClient;

    const reductions: number[] = [];
    const result = await getLogsWithRangeReduction(client, {
      fromBlock: 1n,
      toBlock: 200n,
      address: ['0x15E874Bc667435ddbF2a67c0362701DC23C90833'],
      initialRangeSize: 200,
      onReduce: (prev, next) => {
        reductions.push(prev, next);
      },
    });

    expect(result.reductions).toBeGreaterThanOrEqual(1);
    expect(result.logs).toEqual([]);
    // Full span covered
    const covered = new Set<string>();
    for (const c of calls) {
      for (let b = c.from; b <= c.to; b++) covered.add(b.toString());
    }
    expect(covered.size).toBe(200);
    expect(reductions[0]).toBe(200);
    expect(reductions[1]).toBe(100);
  });
});

describe('processFastCatchupRange', () => {
  it('advances checkpoint over a large empty range without processBlock', async () => {
    const processed: bigint[] = [];
    const advanced: Array<{ from: bigint; to: bigint }> = [];
    const result = await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 1000n,
      toBlock: 10999n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 1000,
      initialLogRangeSize: 5000,
      fetchLogs: async (from, to) => ({
        logs: [],
        fromBlock: from,
        toBlock: to,
        rangeSize: Number(to - from + 1n),
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => {
        processed.push(b);
        return {
          blockNumber: b,
          launches: 0,
          swaps: 0,
          transfers: 0,
          skippedDuplicate: false,
        };
      },
      advanceEmpty: async (from, to) => {
        advanced.push({ from, to });
        return { anchorsWritten: 2, getBlockCalls: 2 };
      },
    });

    expect(processed).toEqual([]);
    expect(advanced).toEqual([{ from: 1000n, to: 10999n }]);
    expect(result.stats.emptyBlocksAdvanced).toBe(10000);
    expect(result.stats.interestingBlocks).toBe(0);
    expect(result.stats.getLogsCalls).toBe(1);
    expect(result.lastBlock).toBe(10999n);
  });

  it('processes one relevant launch block inside a range', async () => {
    const processed: bigint[] = [];
    const advanced: Array<{ from: bigint; to: bigint }> = [];
    const wl = emptyWatchlist();

    const result = await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 100n,
      toBlock: 200n,
      watchlist: wl,
      anchorBlocks: 50,
      initialLogRangeSize: 100,
      fetchLogs: async () => ({
        logs: [fakeLog(150n)],
        fromBlock: 100n,
        toBlock: 200n,
        rangeSize: 101,
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => {
        processed.push(b);
        if (b === 150n) {
          watchlistAddLaunch(wl, {
            chainId: 4663,
            tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
            poolId: `0x${'a'.repeat(64)}`,
            feeDistributorAddress: '0x1111111111111111111111111111111111111111',
            liquidityLockerAddress: '0x2222222222222222222222222222222222222222',
            quoteAsset: ZERO_ADDRESS,
            factoryAddress: '0x15E874Bc667435ddbF2a67c0362701DC23C90833',
            deployerAddress: '0x3333333333333333333333333333333333333333',
            creatorId: `0x${'b'.repeat(64)}`,
            tickLower: -100,
            tickUpper: 100,
            openingSqrtPriceX96: '1',
            lpTokenId: '1',
            currency0: ZERO_ADDRESS,
            currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
            fee: 10000,
            tickSpacing: 10,
            hooks: ZERO_ADDRESS,
          });
          return {
            blockNumber: b,
            launches: 1,
            swaps: 1,
            transfers: 2,
            skippedDuplicate: false,
          };
        }
        return {
          blockNumber: b,
          launches: 0,
          swaps: 0,
          transfers: 0,
          skippedDuplicate: false,
        };
      },
      advanceEmpty: async (from, to) => {
        advanced.push({ from, to });
        return { anchorsWritten: 1, getBlockCalls: 1 };
      },
    });

    expect(processed).toEqual([150n]);
    expect(advanced).toEqual([
      { from: 100n, to: 149n },
      { from: 151n, to: 200n },
    ]);
    expect(result.stats.launches).toBe(1);
    expect(result.stats.rescans).toBe(1);
    expect(wl.tokens.size).toBe(1);
  });

  it('processes relevant swap blocks inside a range', async () => {
    const processed: bigint[] = [];
    await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 1n,
      toBlock: 50n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 25,
      initialLogRangeSize: 50,
      fetchLogs: async () => ({
        logs: [fakeLog(10n), fakeLog(40n)],
        fromBlock: 1n,
        toBlock: 50n,
        rangeSize: 50,
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => {
        processed.push(b);
        return {
          blockNumber: b,
          launches: 0,
          swaps: 1,
          transfers: 0,
          skippedDuplicate: false,
        };
      },
      advanceEmpty: async () => ({ anchorsWritten: 1, getBlockCalls: 1 }),
    });
    expect(processed).toEqual([10n, 40n]);
  });

  it('rescans remainder after dynamic token discovery mid-range', async () => {
    const wl = emptyWatchlist();
    const fetchCalls: Array<{ from: bigint; to: bigint; addressCount: number }> = [];
    const processed: bigint[] = [];

    await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 1n,
      toBlock: 100n,
      watchlist: wl,
      anchorBlocks: 50,
      initialLogRangeSize: 100,
      fetchLogs: async (from, to, address) => {
        fetchCalls.push({ from, to, addressCount: address.length });
        if (fetchCalls.length === 1) {
          return {
            logs: [fakeLog(20n)],
            fromBlock: from,
            toBlock: to,
            rangeSize: Number(to - from + 1n),
            reductions: 0,
            calls: 1,
          };
        }
        // After launch, newly visible token transfer at block 55
        return {
          logs: [fakeLog(55n)],
          fromBlock: from,
          toBlock: to,
          rangeSize: Number(to - from + 1n),
          reductions: 0,
          calls: 1,
        };
      },
      processOneBlock: async (b) => {
        processed.push(b);
        if (b === 20n) {
          watchlistAddLaunch(wl, {
            chainId: 4663,
            tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            poolId: `0x${'c'.repeat(64)}`,
            feeDistributorAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            liquidityLockerAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            quoteAsset: ZERO_ADDRESS,
            factoryAddress: '0x15E874Bc667435ddbF2a67c0362701DC23C90833',
            deployerAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
            creatorId: `0x${'d'.repeat(64)}`,
            tickLower: -100,
            tickUpper: 100,
            openingSqrtPriceX96: '1',
            lpTokenId: '1',
            currency0: ZERO_ADDRESS,
            currency1: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            fee: 10000,
            tickSpacing: 10,
            hooks: ZERO_ADDRESS,
          });
          return {
            blockNumber: b,
            launches: 1,
            swaps: 0,
            transfers: 0,
            skippedDuplicate: false,
          };
        }
        return {
          blockNumber: b,
          launches: 0,
          swaps: 0,
          transfers: 1,
          skippedDuplicate: false,
        };
      },
      advanceEmpty: async () => ({ anchorsWritten: 1, getBlockCalls: 1 }),
    });

    expect(processed).toEqual([20n, 55n]);
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0]).toMatchObject({ from: 1n, to: 100n });
    expect(fetchCalls[1]).toMatchObject({ from: 21n, to: 100n });
    expect(fetchCalls[1]!.addressCount).toBeGreaterThan(fetchCalls[0]!.addressCount);
  });

  it('records provider range reduction stats', async () => {
    const result = await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 1n,
      toBlock: 10n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 5,
      initialLogRangeSize: 10,
      fetchLogs: async (from, to) => ({
        logs: [],
        fromBlock: from,
        toBlock: to,
        rangeSize: 5,
        reductions: 2,
        calls: 3,
      }),
      processOneBlock: async (b) => ({
        blockNumber: b,
        launches: 0,
        swaps: 0,
        transfers: 0,
        skippedDuplicate: false,
      }),
      advanceEmpty: async () => ({ anchorsWritten: 1, getBlockCalls: 1 }),
    });
    expect(result.stats.rangeReductions).toBe(2);
    expect(result.stats.getLogsCalls).toBe(3);
    expect(result.stats.finalRangeSize).toBe(5);
  });

  it('supports restart mid catch-up via cursor semantics (checkpoint gaps filled)', async () => {
    // Simulate restart: first run processes up to 50, second run continues 51..100
    const first = await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 1n,
      toBlock: 50n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 25,
      initialLogRangeSize: 50,
      fetchLogs: async () => ({
        logs: [fakeLog(25n)],
        fromBlock: 1n,
        toBlock: 50n,
        rangeSize: 50,
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => ({
        blockNumber: b,
        launches: 0,
        swaps: 1,
        transfers: 0,
        skippedDuplicate: false,
      }),
      advanceEmpty: async () => ({ anchorsWritten: 1, getBlockCalls: 1 }),
    });
    expect(first.lastBlock).toBe(50n);

    const secondProcessed: bigint[] = [];
    const second = await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 51n,
      toBlock: 100n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 25,
      initialLogRangeSize: 50,
      fetchLogs: async () => ({
        logs: [fakeLog(75n)],
        fromBlock: 51n,
        toBlock: 100n,
        rangeSize: 50,
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => {
        secondProcessed.push(b);
        return {
          blockNumber: b,
          launches: 0,
          swaps: 1,
          transfers: 0,
          skippedDuplicate: false,
        };
      },
      advanceEmpty: async () => ({ anchorsWritten: 1, getBlockCalls: 1 }),
    });
    expect(secondProcessed).toEqual([75n]);
    expect(second.lastBlock).toBe(100n);
  });

  it('transitions conceptually: high lag → fast, low lag → live', () => {
    const threshold = 5000;
    expect(shouldUseFastCatchup(243_496n, threshold)).toBe(true);
    expect(shouldUseFastCatchup(100n, threshold)).toBe(false);
    expect(shouldUseFastCatchup(5000n, threshold)).toBe(false);
  });

  it('does not double-process HELLO when already processed (duplicate short-circuit)', async () => {
    const calls: bigint[] = [];
    await processFastCatchupRange({
      runInTxn: async (fn) => fn({} as never),
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 55863290n,
      toBlock: 55863290n,
      watchlist: emptyWatchlist(),
      anchorBlocks: 64,
      initialLogRangeSize: 1,
      fetchLogs: async () => ({
        logs: [fakeLog(55863290n)],
        fromBlock: 55863290n,
        toBlock: 55863290n,
        rangeSize: 1,
        reductions: 0,
        calls: 1,
      }),
      processOneBlock: async (b) => {
        calls.push(b);
        return {
          blockNumber: b,
          launches: 0,
          swaps: 0,
          transfers: 0,
          skippedDuplicate: true,
        };
      },
      advanceEmpty: async () => ({ anchorsWritten: 0, getBlockCalls: 0 }),
    });
    expect(calls).toEqual([55863290n]);
  });
});

describe('advanceEmptyRange', () => {
  it('writes sparse anchors and checkpoints end hash', async () => {
    const upserts: Array<{ blockNumber: bigint; blockHash: string }> = [];
    let checkpoint: { lastBlockNumber: bigint; lastBlockHash: string } | null = null;
    const fetched: bigint[] = [];

    const realDb = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('processed_blocks')) {
          upserts.push({
            blockNumber: BigInt(String(params[1])),
            blockHash: String(params[2]),
          });
        }
        if (sql.includes('indexer_checkpoints')) {
          checkpoint = {
            lastBlockNumber: BigInt(String(params[2])),
            lastBlockHash: String(params[3]),
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const result = await advanceEmptyRange(realDb as never, {
      client: {} as PublicClient,
      chainId: 4663,
      fromBlock: 100n,
      toBlock: 292n,
      anchorBlocks: 64,
      fetchBlock: async (n) => {
        fetched.push(n);
        const hex = n.toString(16).padStart(64, '0');
        return {
          hash: `0x${hex}` as Hex,
          parentHash: `0x${'0'.repeat(64)}` as Hex,
          timestamp: 1n,
        };
      },
    });

    expect(fetched).toEqual(planEmptyRangeAnchors(100n, 292n, 64));
    expect(result.anchorsWritten).toBe(fetched.length);
    expect(upserts.length).toBe(fetched.length);
    expect(checkpoint?.lastBlockNumber).toBe(292n);
  });
});

describe('live vs fast mode selection in runner terms', () => {
  it('near tip uses live batch size semantics', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS: '5000',
      SCOOP_FAST_CATCHUP_RANGE: '5000',
      SCOOP_MAX_BLOCK_BATCH: '20',
    });
    const lag = 100n;
    const useFast = shouldUseFastCatchup(lag, config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS);
    expect(useFast).toBe(false);
    const span = useFast
      ? config.SCOOP_FAST_CATCHUP_RANGE
      : config.SCOOP_MAX_BLOCK_BATCH;
    expect(span).toBe(20);
  });
});
