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
  getQuoteAssetDecimals,
} from '@scoop/db';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import {
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  TICK_SPACING,
  classifyBuySell,
  classifyTransfer,
  executionPriceQuoteX18,
  normalizeAddress,
  normalizeBytes32,
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
import { mergeTradeIntoLeafAndPersist } from './projections/candles.js';
import { resolveTradeUsdFields } from './projections/usd.js';
import { applyHolderTransfer } from './projections/holders.js';
import { processCreatorEvents } from './projections/creators.js';
import { processHolderRewardEvents } from './projections/holderRewards.js';
import { extractLaunchEconomics } from './projections/launchEconomics.js';
import { confirmationStatusForBlock, type ConfirmationHeads } from './confirmations.js';

const TOKEN_LAUNCHED_TOPICS = new Set(
  [
    encodeEventTopics({
      abi: scoopAbis.ScoopFactory,
      eventName: 'TokenLaunched',
    })[0],
    encodeEventTopics({
      abi: scoopAbis.ScoopFactoryHistoricalCanary,
      eventName: 'TokenLaunched',
    })[0],
  ].map((t) => normalizeBytes32(t as Hex)),
);

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
    quoteUsdMaxAgeSeconds?: number;
    streamName?: string;
  },
): Promise<ProcessBlockResult> {
  const { client, chainId, blockNumber, watchlist } = args;
  const quoteUsdMaxAgeSeconds = args.quoteUsdMaxAgeSeconds ?? 300;
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
    ...(watchlist.holderVaultAddresses ?? []),
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

  // Discover TokenLaunched (canonical P3 + historical canary topics)
  const launchLogs = logs.filter(
    (l) =>
      normalizeAddress(l.address) === factory &&
      l.topics[0] &&
      TOKEN_LAUNCHED_TOPICS.has(normalizeBytes32(l.topics[0])),
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

    const economics = extractLaunchEconomics(decoded);

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
        feeDistributorAddress:
          economics.feeDistributorAddress ?? launchView.feeDistributor,
        liquidityLockerAddress:
          economics.liquidityLockerAddress ?? launchView.liquidityLocker,
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
        additionalFee: economics.additionalFee,
        totalPoolFee: economics.totalPoolFee,
        creatorAllocationDestination: economics.creatorAllocationDestination,
        additionalFeeDestination: economics.additionalFeeDestination,
        holderRewardsAddress: economics.holderRewardsAddress,
      },
      protocol: {
        poolManager,
        positionManager,
        universalRouter: scoopV1MainnetCanaryManifest.contracts.UniversalRouter,
        poolFee: economics.totalPoolFee,
      },
      confirmationStatus,
      dustRaw: args.dustRaw,
      quoteUsdMaxAgeSeconds,
    });

    const quoteDecimals =
      (await getQuoteAssetDecimals(db, chainId, launchView.quoteAsset)) ?? 18;

    watchlistAddLaunch(watchlist, {
      chainId,
      tokenAddress,
      poolId: launchView.poolId,
      feeDistributorAddress:
        economics.feeDistributorAddress ?? launchView.feeDistributor,
      liquidityLockerAddress:
        economics.liquidityLockerAddress ?? launchView.liquidityLocker,
      holderRewardsAddress: economics.holderRewardsAddress,
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
      fee: economics.totalPoolFee,
      tickSpacing: TICK_SPACING,
      hooks: ZERO_ADDRESS,
      tokenIsCurrency1: true,
      tokenDecimals: tokenMeta.decimals || 18,
      quoteDecimals,
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
    const quoteDecimals = entry.quoteDecimals;
    const tokenDecimals = entry.tokenDecimals;
    const executionPrice = executionPriceQuoteX18({
      quoteAmountRaw,
      tokenAmountRaw,
      quoteDecimals,
      tokenDecimals,
    });

    const tradeUsd = await resolveTradeUsdFields(db, {
      chainId,
      quoteAsset: entry.quoteAsset,
      quoteAmountRaw,
      executionPriceQuoteX18: executionPrice,
      quoteDecimals,
      tradeTimestampSec: Number(blockTimestamp),
      maxAgeSeconds: quoteUsdMaxAgeSeconds,
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
      quoteUsdX18: tradeUsd.quoteUsdX18,
      executionPriceUsdX18: tradeUsd.executionPriceUsdX18,
      usdValueX18: tradeUsd.usdValueX18,
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

    // Candle OHLC uses execution price (canonical) — same as rebuild/enrich path.
    // Keep sqrt price for market-state / mark via refreshTokenMarketFromTrades below.
    const tradeMerge = {
      chainId,
      tokenAddress: entry.tokenAddress,
      poolId,
      blockTimestampSec: Number(blockTimestamp),
      blockNumber: Number(blockNumber),
      priceQuoteX18: executionPrice,
      quoteAmountRaw,
      tokenAmountRaw,
      side,
      priceUsdX18: tradeUsd.executionPriceUsdX18,
      usdValueX18: tradeUsd.usdValueX18,
    };
    await mergeTradeIntoLeafAndPersist(db, { ...tradeMerge, interval: '5s' });
    await mergeTradeIntoLeafAndPersist(db, { ...tradeMerge, interval: '1m' });

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
      quoteDecimals,
      tokenDecimals,
      quoteAsset: entry.quoteAsset,
      quoteUsdMaxAgeSeconds,
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
      entry.tokenAddress,
      DEAD_ADDRESS,
      ZERO_ADDRESS,
    ]);
    if (entry.holderRewardsAddress) system.add(entry.holderRewardsAddress);
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

  // HolderRewards vault events (discovered vaults only)
  const holderEvents = decodedAll.filter((e) =>
    [
      'HolderRewardDeposited',
      'HolderRewardRoundPublished',
      'HolderRewardPushed',
      'HolderRewardClaimed',
      'HolderRewardPushFailed',
      'FeeDistributorInitialized',
    ].includes(e.kind),
  ) as DecodedChainEvent[];

  for (const ev of holderEvents) {
    const log = logs.find((l) => Number(l.logIndex) === ev.logIndex);
    if (!log?.transactionHash) continue;
    const txHash = normalizeBytes32(log.transactionHash);

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

    await processHolderRewardEvents(db, {
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
