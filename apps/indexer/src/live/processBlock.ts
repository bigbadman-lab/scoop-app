import { encodeEventTopics, type Hex, type PublicClient } from 'viem';
import type { Queryable } from '@scoop/db';
import {
  upsertRawChainEvent,
  upsertTrade,
  upsertTransfer,
  upsertProcessedBlock,
  getProcessedBlock,
  upsertIndexerCheckpoint,
  upsertPool,
} from '@scoop/db';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import {
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  classifyBuySell,
  classifyTransfer,
  executionPriceQuoteX18,
  normalizeAddress,
  normalizeBytes32,
  priceQuoteX18FromSqrt,
} from '@scoop/shared';
import { MAIN_STREAM_NAME } from '../config.js';
import { decodeLogs, decodeReceiptLogs, type DecodedChainEvent } from './decode.js';
import { normalizeLaunch } from './normalizeLaunch.js';
import { hydrateLaunchView, hydrateTokenMetadata } from './hydrate.js';
import {
  loadWatchlist,
  watchlistAddLaunch,
  type Watchlist,
} from './watchlist.js';
import { refreshTokenMarketFromTrades } from './projections/market.js';
import {
  bucketStartFor,
  mergeTradeIntoMinuteCandle,
  upsertMinuteAndRollups,
  type MinuteCandle,
} from './projections/candles.js';
import { applyHolderTransfer } from './projections/holders.js';
import { processCreatorEvents } from './projections/creators.js';
import { confirmationStatusForBlock, type ConfirmationHeads } from './confirmations.js';

const TOKEN_LAUNCHED_TOPIC = encodeEventTopics({
  abi: scoopAbis.ScoopFactory,
  eventName: 'TokenLaunched',
})[0] as Hex;

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

export interface ProcessBlockResult {
  blockNumber: bigint;
  launches: number;
  swaps: number;
  transfers: number;
  skippedDuplicate: boolean;
}

/**
 * Deterministic per-block pipeline in one DB transaction (caller wraps withTransaction).
 * NEVER advances checkpoint before all writes in this function complete (same txn).
 */
export async function processBlock(
  db: Queryable,
  args: {
    client: PublicClient;
    chainId: number;
    blockNumber: bigint;
    watchlist: Watchlist;
    heads?: ConfirmationHeads;
    dustRaw?: bigint;
    streamName?: string;
  },
): Promise<ProcessBlockResult> {
  const { client, chainId, blockNumber, watchlist } = args;
  const streamName = args.streamName ?? MAIN_STREAM_NAME;
  const factory = normalizeAddress(scoopV1MainnetCanaryManifest.contracts.ScoopFactory);
  const poolManager = normalizeAddress(scoopV1MainnetCanaryManifest.contracts.PoolManager);
  const positionManager = normalizeAddress(
    scoopV1MainnetCanaryManifest.contracts.PositionManager,
  );
  const creatorRewards = normalizeAddress(
    scoopV1MainnetCanaryManifest.contracts.ScoopCreatorRewards,
  );

  const block = await client.getBlock({ blockNumber, includeTransactions: false });
  const blockHash = normalizeBytes32(block.hash!);
  const parentHash = block.parentHash ? normalizeBytes32(block.parentHash) : null;
  const blockTimestamp = block.timestamp;

  const existing = await getProcessedBlock(db, chainId, blockNumber);
  if (existing && normalizeBytes32(existing.blockHash) === blockHash) {
    // Idempotent replay of same canonical block — still refresh checkpoint
    await upsertIndexerCheckpoint(db, {
      chainId,
      streamName,
      lastBlockNumber: blockNumber,
      lastBlockHash: blockHash,
      lastLogIndex: -1,
    });
    return {
      blockNumber,
      launches: 0,
      swaps: 0,
      transfers: 0,
      skippedDuplicate: true,
    };
  }

  const confirmationStatus = args.heads
    ? confirmationStatusForBlock(blockNumber, args.heads)
    : 'confirmed';

  // Factory TokenLaunched + watched addresses
  const addressFilters = [
    factory,
    poolManager,
    creatorRewards,
    ...watchlist.tokenAddresses,
    ...watchlist.distributorAddresses,
  ];
  const uniqueAddresses = [...new Set(addressFilters)] as Hex[];

  const logs = await client.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
    address: uniqueAddresses.length > 0 ? uniqueAddresses : undefined,
  });

  const decodedAll = decodeLogs(
    logs.map((l) => ({
      address: l.address,
      topics: [...(l.topics ?? [])],
      data: l.data,
      logIndex: l.logIndex,
    })),
  );

  // Persist raw events for this block's filtered logs
  const logsByTx = new Map<string, typeof logs>();
  for (const log of logs) {
    const tx = normalizeBytes32(log.transactionHash!);
    const list = logsByTx.get(tx) ?? [];
    list.push(log);
    logsByTx.set(tx, list);
  }

  let launchCount = 0;
  let swapCount = 0;
  let transferCount = 0;

  // Discover TokenLaunched
  const launchLogs = logs.filter(
    (l) =>
      normalizeAddress(l.address) === factory &&
      l.topics[0] &&
      normalizeBytes32(l.topics[0]) === normalizeBytes32(TOKEN_LAUNCHED_TOPIC),
  );

  for (const launchLog of launchLogs) {
    const txHash = normalizeBytes32(launchLog.transactionHash!);
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    const tx = await client.getTransaction({ hash: txHash as Hex });
    const decoded = decodeReceiptLogs(receipt);
    const tokenLaunched = decoded.find((e) => e.kind === 'TokenLaunched');
    if (!tokenLaunched || tokenLaunched.kind !== 'TokenLaunched') continue;

    const tokenAddress = normalizeAddress(String(tokenLaunched.args.token));
    const [tokenMeta, launchView] = await Promise.all([
      hydrateTokenMetadata(client, tokenAddress),
      hydrateLaunchView(client, tokenAddress),
    ]);

    const initialBuy = decoded.find((e) => e.kind === 'InitialBuyExecuted');
    const launchFee = decoded.find((e) => e.kind === 'LaunchFeePaid');

    const launchFeeRaw =
      launchFee && launchFee.kind === 'LaunchFeePaid'
        ? BigInt(String(launchFee.args.amount ?? 0))
        : 0n;
    const initialBuyQuoteRaw =
      initialBuy && initialBuy.kind === 'InitialBuyExecuted'
        ? BigInt(String(initialBuy.args.quoteAmountIn ?? 0))
        : null;
    const initialBuyTokensRaw =
      initialBuy && initialBuy.kind === 'InitialBuyExecuted'
        ? BigInt(String(initialBuy.args.tokensOut ?? 0))
        : null;

    await normalizeLaunch(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      txIndex: Number(receipt.transactionIndex),
      txFrom: tx.from,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        logIndex: Number(log.logIndex),
        topics: [...(log.topics ?? [])],
        data: log.data,
      })),
      decoded,
      tokenMeta,
      launch: {
        tokenAddress,
        factoryAddress: factory,
        deployerAddress: launchView.deployer,
        creatorId: launchView.creatorId,
        quoteAsset: launchView.quoteAsset,
        feeDistributorAddress: launchView.feeDistributor,
        liquidityLockerAddress: launchView.liquidityLocker,
        poolId: launchView.poolId,
        lpTokenId: launchView.lpTokenId,
        openingSqrtPriceX96: launchView.openingSqrtPriceX96,
        openingTick: launchView.openingTick,
        tickLower: launchView.tickLower,
        tickUpper: launchView.tickUpper,
        launchFeeRaw,
        initialBuyPresent: Boolean(initialBuy),
        initialBuyQuoteRaw,
        initialBuyTokensRaw,
        launchLogIndex: tokenLaunched.logIndex,
      },
      protocol: {
        poolManager,
        positionManager,
        universalRouter: scoopV1MainnetCanaryManifest.contracts.UniversalRouter,
      },
      confirmationStatus,
      dustRaw: args.dustRaw,
    });

    watchlistAddLaunch(watchlist, {
      chainId,
      tokenAddress,
      poolId: launchView.poolId,
      feeDistributorAddress: launchView.feeDistributor,
      liquidityLockerAddress: launchView.liquidityLocker,
      quoteAsset: launchView.quoteAsset,
      factoryAddress: factory,
      deployerAddress: launchView.deployer,
      creatorId: launchView.creatorId,
      tickLower: launchView.tickLower,
      tickUpper: launchView.tickUpper,
      openingSqrtPriceX96: launchView.openingSqrtPriceX96.toString(),
      lpTokenId: launchView.lpTokenId.toString(),
      currency0: normalizeAddress(launchView.quoteAsset),
      currency1: tokenAddress,
      fee: 10000,
      tickSpacing: 10,
      hooks: ZERO_ADDRESS,
      tokenIsCurrency1: true,
    });
    launchCount += 1;
  }

  // Process swaps for known pools (skip already handled in launch receipts)
  const launchTxHashes = new Set(
    launchLogs.map((l) => normalizeBytes32(l.transactionHash!)),
  );

  for (const ev of decodedAll) {
    if (ev.kind !== 'Swap') continue;
    if (normalizeAddress(ev.address) !== poolManager) continue;

    const poolId = normalizeBytes32(String(ev.args.id ?? ev.args.poolId ?? ''));
    const entry = watchlist.pools.get(poolId);
    if (!entry) continue;

    // Find log to get tx hash
    const log = logs.find((l) => Number(l.logIndex) === ev.logIndex);
    if (!log?.transactionHash) continue;
    const txHash = normalizeBytes32(log.transactionHash);
    if (launchTxHashes.has(txHash)) continue; // already in normalizeLaunch

    const tx = await client.getTransaction({ hash: txHash as Hex });
    const amount0 = BigInt(String(ev.args.amount0));
    const amount1 = BigInt(String(ev.args.amount1));
    const sqrtAfter = BigInt(String(ev.args.sqrtPriceX96));
    const tickAfter = Number(ev.args.tick);
    const liqAfter = BigInt(String(ev.args.liquidity));
    const side = classifyBuySell(amount0, amount1);
    const quoteAmountRaw = amount0 < 0n ? -amount0 : amount0;
    const tokenAmountRaw = amount1 < 0n ? -amount1 : amount1;
    const executionPrice = executionPriceQuoteX18({
      quoteAmountRaw,
      tokenAmountRaw,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });

    await upsertRawChainEvent(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      txIndex: Number(log.transactionIndex ?? 0),
      logIndex: ev.logIndex,
      contractAddress: ev.address,
      topic0: log.topics[0] ? normalizeBytes32(log.topics[0]) : `0x${'0'.repeat(64)}`,
      topics: [...(log.topics ?? [])],
      data: log.data,
      decodedEventName: 'Swap',
      decodedPayload: jsonSafe(ev.args),
      confirmationStatus,
      isCanonical: true,
    });

    await upsertTrade(db, {
      chainId,
      txHash,
      logIndex: ev.logIndex,
      blockNumber,
      blockHash,
      blockTimestamp,
      poolId,
      tokenAddress: entry.tokenAddress,
      quoteAsset: entry.quoteAsset,
      swapSender: normalizeAddress(String(ev.args.sender)),
      txFrom: tx.from,
      traderAddress: normalizeAddress(tx.from),
      traderAttributionType: 'tx_from',
      side,
      amount0Raw: amount0,
      amount1Raw: amount1,
      quoteAmountRaw,
      tokenAmountRaw,
      sqrtPriceX96After: sqrtAfter,
      tickAfter,
      liquidityAfterRaw: liqAfter,
      fee: entry.fee,
      executionPriceQuoteX18: executionPrice,
      isInitialBuy: false,
    });

    await upsertPool(db, {
      chainId,
      poolId,
      tokenAddress: entry.tokenAddress,
      quoteAsset: entry.quoteAsset,
      currency0: entry.currency0,
      currency1: entry.currency1,
      fee: entry.fee,
      tickSpacing: entry.tickSpacing,
      hooks: entry.hooks,
      lpTokenId: entry.lpTokenId,
      liquidityLockerAddress: entry.liquidityLockerAddress,
      initializedTxHash: txHash,
      initializedBlock: blockNumber,
      initializedAt: blockTimestamp,
      openingSqrtPriceX96: entry.openingSqrtPriceX96,
      openingTick: 0,
      currentSqrtPriceX96: sqrtAfter,
      currentTick: tickAfter,
      currentLiquidityRaw: liqAfter,
      lastSwapBlock: blockNumber,
    });

    const price = priceQuoteX18FromSqrt({
      sqrtPriceX96: sqrtAfter,
      tokenIsCurrency1: entry.tokenIsCurrency1,
      quoteDecimals: 18,
    });
    const bucketStart = bucketStartFor('1m', Number(blockTimestamp));
    const existingCandle = await db.query<{
      open_quote_x18: string;
      high_quote_x18: string;
      low_quote_x18: string;
      close_quote_x18: string;
      quote_volume_raw: string;
      token_volume_raw: string;
      trade_count: number;
      buy_count: number;
      sell_count: number;
      first_trade_block: string | null;
      last_trade_block: string | null;
    }>(
      `SELECT open_quote_x18, high_quote_x18, low_quote_x18, close_quote_x18,
              quote_volume_raw, token_volume_raw, trade_count, buy_count, sell_count,
              first_trade_block, last_trade_block
       FROM candles
       WHERE chain_id = $1 AND pool_id = $2 AND interval = '1m' AND bucket_start = $3`,
      [chainId, poolId, bucketStart],
    );
    const prev: MinuteCandle | null = existingCandle.rows[0]
      ? {
          bucketStart,
          openQuoteX18: BigInt(existingCandle.rows[0].open_quote_x18),
          highQuoteX18: BigInt(existingCandle.rows[0].high_quote_x18),
          lowQuoteX18: BigInt(existingCandle.rows[0].low_quote_x18),
          closeQuoteX18: BigInt(existingCandle.rows[0].close_quote_x18),
          quoteVolumeRaw: BigInt(existingCandle.rows[0].quote_volume_raw),
          tokenVolumeRaw: BigInt(existingCandle.rows[0].token_volume_raw),
          tradeCount: existingCandle.rows[0].trade_count,
          buyCount: existingCandle.rows[0].buy_count,
          sellCount: existingCandle.rows[0].sell_count,
          firstTradeBlock: existingCandle.rows[0].first_trade_block
            ? Number(existingCandle.rows[0].first_trade_block)
            : null,
          lastTradeBlock: existingCandle.rows[0].last_trade_block
            ? Number(existingCandle.rows[0].last_trade_block)
            : null,
        }
      : null;

    const merged = mergeTradeIntoMinuteCandle(prev, {
      priceQuoteX18: price,
      quoteAmountRaw,
      tokenAmountRaw,
      side,
      blockNumber: Number(blockNumber),
      bucketStart,
    });
    await upsertMinuteAndRollups(db, {
      chainId,
      tokenAddress: entry.tokenAddress,
      poolId,
      candle: merged,
    });

    await refreshTokenMarketFromTrades(db, {
      chainId,
      tokenAddress: entry.tokenAddress,
      poolId,
      tickLower: entry.tickLower,
      tickUpper: entry.tickUpper,
      openingSqrtPriceX96: BigInt(entry.openingSqrtPriceX96),
      liquidityRaw: liqAfter,
      sqrtPriceX96: sqrtAfter,
      tick: tickAfter,
      sourceBlock: blockNumber,
      sourceTxHash: txHash,
      sourceLogIndex: ev.logIndex,
      tokenIsCurrency1: entry.tokenIsCurrency1,
      dustRaw: args.dustRaw,
      nowSec: Number(blockTimestamp),
    });

    swapCount += 1;
  }

  // Transfers for known tokens
  for (const ev of decodedAll) {
    if (ev.kind !== 'Transfer') continue;
    const entry = watchlist.tokens.get(normalizeAddress(ev.address));
    if (!entry) continue;
    const log = logs.find((l) => Number(l.logIndex) === ev.logIndex);
    if (!log?.transactionHash) continue;
    const txHash = normalizeBytes32(log.transactionHash);
    if (launchTxHashes.has(txHash)) continue;

    const transferClass = classifyTransfer({
      from: ev.args.from,
      to: ev.args.to,
      amount: ev.args.value,
      factory: entry.factoryAddress,
      creator: entry.deployerAddress,
      poolManager,
      dead: DEAD_ADDRESS,
      zero: ZERO_ADDRESS,
    });

    await upsertRawChainEvent(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      txIndex: Number(log.transactionIndex ?? 0),
      logIndex: ev.logIndex,
      contractAddress: ev.address,
      topic0: log.topics[0] ? normalizeBytes32(log.topics[0]) : `0x${'0'.repeat(64)}`,
      topics: [...(log.topics ?? [])],
      data: log.data,
      decodedEventName: 'Transfer',
      decodedPayload: jsonSafe(ev.args),
      confirmationStatus,
      isCanonical: true,
    });

    await upsertTransfer(db, {
      chainId,
      tokenAddress: entry.tokenAddress,
      txHash,
      logIndex: ev.logIndex,
      blockNumber,
      blockHash,
      blockTimestamp,
      fromAddress: ev.args.from,
      toAddress: ev.args.to,
      amountRaw: ev.args.value,
      transferClass,
    });

    const system = new Set<string>([
      entry.factoryAddress,
      poolManager,
      positionManager,
      entry.liquidityLockerAddress,
      entry.feeDistributorAddress,
      DEAD_ADDRESS,
      ZERO_ADDRESS,
    ]);
    await applyHolderTransfer(db, {
      chainId,
      tokenAddress: entry.tokenAddress,
      transfer: {
        from: ev.args.from,
        to: ev.args.to,
        amount: ev.args.value,
        blockNumber: Number(blockNumber),
      },
      systemAddresses: system,
    });
    transferCount += 1;
  }

  // Fee distributor / creator rewards
  const creatorEvents = decodedAll.filter((e) =>
    [
      'ETHDistributed',
      'TokenDistributed',
      'ETHCredited',
      'TokenCredited',
      'ETHClaimed',
      'TokenClaimed',
      'SourceRegistered',
    ].includes(e.kind),
  ) as DecodedChainEvent[];

  // Group by tx for processCreatorEvents (uses single txHash — process per event)
  for (const ev of creatorEvents) {
    const log = logs.find((l) => Number(l.logIndex) === ev.logIndex);
    if (!log?.transactionHash) continue;
    const txHash = normalizeBytes32(log.transactionHash);
    if (launchTxHashes.has(txHash) && ev.kind === 'SourceRegistered') continue;

    await upsertRawChainEvent(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      txIndex: Number(log.transactionIndex ?? 0),
      logIndex: ev.logIndex,
      contractAddress: ev.address,
      topic0: log.topics[0] ? normalizeBytes32(log.topics[0]) : `0x${'0'.repeat(64)}`,
      topics: [...(log.topics ?? [])],
      data: log.data,
      decodedEventName: ev.kind !== 'unknown' ? ev.kind : null,
      decodedPayload: ev.kind !== 'unknown' ? jsonSafe(ev.args) : null,
      confirmationStatus,
      isCanonical: true,
    });

    await processCreatorEvents(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      events: [ev],
      watchlist,
    });
  }

  await upsertProcessedBlock(db, {
    chainId,
    blockNumber,
    blockHash,
    parentHash,
    blockTimestamp,
  });

  // Checkpoint last — same transaction as all writes above
  await upsertIndexerCheckpoint(db, {
    chainId,
    streamName,
    lastBlockNumber: blockNumber,
    lastBlockHash: blockHash,
    lastLogIndex: logs.length > 0 ? Math.max(...logs.map((l) => Number(l.logIndex))) : -1,
  });

  return {
    blockNumber,
    launches: launchCount,
    swaps: swapCount,
    transfers: transferCount,
    skippedDuplicate: false,
  };
}

export { loadWatchlist };
