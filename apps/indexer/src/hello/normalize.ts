import type { Queryable } from '@scoop/db';
import {
  upsertRawChainEvent,
  upsertLaunch,
  upsertToken,
  upsertCreator,
  upsertPool,
  upsertTrade,
  upsertTransfer,
  upsertHolderBalance,
  upsertTokenMarketState,
  upsertCandle,
  upsertIndexerCheckpoint,
  upsertIndexerHealth,
  upsertAddressClassification,
} from '@scoop/db';
import {
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  classifyBuySell,
  classifyTransfer,
  executionPriceQuoteX18,
  foldHolderBalances,
  priceQuoteX18FromSqrt,
  normalizeAddress,
} from '@scoop/shared';
import { HELLO } from './fixture.js';
import type { DecodedHelloEvent } from './decode.js';
import type { HelloTokenMetadata } from './hydrate.js';

export interface HelloNormalizeInput {
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: bigint;
  txHash: string;
  txIndex: number;
  txFrom: string;
  logs: Array<{
    address: string;
    logIndex: number;
    topics: string[];
    data: string;
  }>;
  decoded: DecodedHelloEvent[];
  tokenMeta: HelloTokenMetadata;
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

/**
 * Two-pass HELLO normalize:
 * 1) upsert raw_chain_events
 * 2) derive launches/tokens/creators/pools/trades/transfers/holders/market/candle/checkpoint/health
 */
export async function normalizeHello(db: Queryable, input: HelloNormalizeInput): Promise<void> {
  const chainId = input.chainId;
  const blockNumber = input.blockNumber;
  const blockHash = input.blockHash.toLowerCase();
  const blockTimestamp = input.blockTimestamp;
  const txHash = input.txHash.toLowerCase();
  const txFrom = normalizeAddress(input.txFrom);

  for (const log of input.logs) {
    const decoded = input.decoded.find((d) => d.logIndex === log.logIndex);
    await upsertRawChainEvent(db, {
      chainId,
      blockNumber,
      blockHash,
      blockTimestamp,
      txHash,
      txIndex: input.txIndex,
      logIndex: log.logIndex,
      contractAddress: log.address,
      topic0: log.topics[0] ?? `0x${'0'.repeat(64)}`,
      topics: log.topics,
      data: log.data,
      decodedEventName: decoded && decoded.kind !== 'unknown' ? decoded.kind : null,
      decodedPayload: decoded && decoded.kind !== 'unknown' ? jsonSafe(decoded.args) : null,
      confirmationStatus: 'confirmed',
      isCanonical: true,
    });
  }

  await upsertCreator(db, {
    chainId,
    creatorId: HELLO.creatorId,
    creatorType: 'wallet',
    walletAddress: HELLO.creator,
    firstSeenBlock: blockNumber,
  });

  await upsertToken(db, {
    chainId,
    tokenAddress: HELLO.token,
    name: input.tokenMeta.name || HELLO.metadata.name,
    symbol: input.tokenMeta.symbol || HELLO.metadata.symbol,
    decimals: input.tokenMeta.decimals || HELLO.tokenDecimals,
    totalSupplyRaw: input.tokenMeta.totalSupply || HELLO.totalSupply,
    imageUri: input.tokenMeta.logo || HELLO.metadata.imageUri,
    description: input.tokenMeta.description || HELLO.metadata.description,
    twitter: input.tokenMeta.twitter || HELLO.metadata.twitter,
    telegram: input.tokenMeta.telegram || HELLO.metadata.telegram,
    discord: input.tokenMeta.discord || HELLO.metadata.discord,
    website: input.tokenMeta.website || HELLO.metadata.website,
    farcaster: input.tokenMeta.farcaster || HELLO.metadata.farcaster,
    deployerAddress: input.tokenMeta.deployer || HELLO.creator,
    launchFactoryAddress: input.tokenMeta.launchFactory || HELLO.factory,
    metadataSourceBlock: blockNumber,
  });

  await upsertLaunch(db, {
    chainId,
    tokenAddress: HELLO.token,
    factoryAddress: HELLO.factory,
    deployerAddress: HELLO.creator,
    creatorId: HELLO.creatorId,
    quoteAsset: HELLO.quoteAsset,
    feeDistributorAddress: HELLO.feeDistributor,
    liquidityLockerAddress: HELLO.locker,
    poolId: HELLO.poolId,
    lpTokenId: HELLO.lpTokenId,
    openingSqrtPriceX96: HELLO.openingSqrtPriceX96,
    openingTick: HELLO.openingTick,
    tickLower: HELLO.tickLower,
    tickUpper: HELLO.tickUpper,
    launchTxHash: txHash,
    launchBlock: blockNumber,
    launchLogIndex: HELLO.launchLogIndex,
    launchedAt: blockTimestamp,
    launchFeeRaw: HELLO.launchFee,
    initialBuyPresent: true,
    initialBuyQuoteRaw: HELLO.initialBuyQuote,
    initialBuyTokensRaw: HELLO.initialBuyTokens,
    metadataHydrated: true,
  });

  const swapEvent = input.decoded.find((e) => e.kind === 'Swap');
  const amount0 =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.amount0))
      : -HELLO.initialBuyQuote;
  const amount1 =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.amount1))
      : HELLO.initialBuyTokens;
  const sqrtAfter =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.sqrtPriceX96))
      : HELLO.postSwapSqrtPriceX96;
  const tickAfter =
    swapEvent && swapEvent.kind === 'Swap' ? Number(swapEvent.args.tick) : HELLO.postSwapTick;
  const liqAfter =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.liquidity))
      : HELLO.postSwapLiquidity;
  const swapSender =
    swapEvent && swapEvent.kind === 'Swap'
      ? normalizeAddress(String(swapEvent.args.sender))
      : HELLO.universalRouter;
  const swapLogIndex =
    swapEvent && swapEvent.kind === 'Swap' ? swapEvent.logIndex : HELLO.swapLogIndex;

  await upsertPool(db, {
    chainId,
    poolId: HELLO.poolId,
    tokenAddress: HELLO.token,
    quoteAsset: HELLO.quoteAsset,
    currency0: ZERO_ADDRESS,
    currency1: HELLO.token,
    fee: HELLO.poolFee,
    tickSpacing: HELLO.tickSpacing,
    hooks: HELLO.hooks,
    lpTokenId: HELLO.lpTokenId,
    liquidityLockerAddress: HELLO.locker,
    initializedTxHash: txHash,
    initializedBlock: blockNumber,
    initializedAt: blockTimestamp,
    openingSqrtPriceX96: HELLO.openingSqrtPriceX96,
    openingTick: HELLO.openingTick,
    currentSqrtPriceX96: sqrtAfter,
    currentTick: tickAfter,
    currentLiquidityRaw: liqAfter,
    lastSwapBlock: blockNumber,
  });

  const side = classifyBuySell(amount0, amount1);
  const quoteAmountRaw = amount0 < 0n ? -amount0 : amount0;
  const tokenAmountRaw = amount1 < 0n ? -amount1 : amount1;
  const executionPrice = executionPriceQuoteX18({
    quoteAmountRaw,
    tokenAmountRaw,
    quoteDecimals: HELLO.quoteDecimals,
    tokenDecimals: HELLO.tokenDecimals,
  });

  await upsertTrade(db, {
    chainId,
    txHash,
    logIndex: swapLogIndex,
    blockNumber,
    blockHash,
    blockTimestamp,
    poolId: HELLO.poolId,
    tokenAddress: HELLO.token,
    quoteAsset: HELLO.quoteAsset,
    swapSender,
    txFrom,
    traderAddress: txFrom,
    traderAttributionType: 'tx_from',
    side,
    amount0Raw: amount0,
    amount1Raw: amount1,
    quoteAmountRaw,
    tokenAmountRaw,
    sqrtPriceX96After: sqrtAfter,
    tickAfter,
    liquidityAfterRaw: liqAfter,
    fee: HELLO.poolFee,
    executionPriceQuoteX18: executionPrice,
    quoteUsdX18: null,
    executionPriceUsdX18: null,
    usdValueX18: null,
    isInitialBuy: true,
  });

  const transferEvents = input.decoded.filter(
    (e): e is Extract<DecodedHelloEvent, { kind: 'Transfer' }> =>
      e.kind === 'Transfer' && normalizeAddress(e.address) === HELLO.token,
  );

  const holderTransfers = [];
  for (const ev of transferEvents) {
    const transferClass = classifyTransfer({
      from: ev.args.from,
      to: ev.args.to,
      amount: ev.args.value,
      factory: HELLO.factory,
      creator: HELLO.creator,
      poolManager: HELLO.poolManager,
      dead: DEAD_ADDRESS,
      zero: ZERO_ADDRESS,
    });

    await upsertTransfer(db, {
      chainId,
      tokenAddress: HELLO.token,
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

    holderTransfers.push({
      from: ev.args.from,
      to: ev.args.to,
      amount: ev.args.value,
      blockNumber: Number(blockNumber),
    });
  }

  const holders = foldHolderBalances(holderTransfers);
  const system = new Set<string>([
    HELLO.factory,
    HELLO.poolManager,
    HELLO.positionManager,
    HELLO.locker,
    HELLO.feeDistributor,
    DEAD_ADDRESS,
    ZERO_ADDRESS,
  ]);

  for (const holder of holders) {
    const isSystem = system.has(holder.address);
    await upsertHolderBalance(db, {
      chainId,
      tokenAddress: HELLO.token,
      holderAddress: holder.address,
      balanceRaw: holder.balanceRaw,
      holderClass: isSystem ? 'system' : 'user',
      isSystemAddress: isSystem,
      firstSeenBlock: holder.firstSeenBlock,
      lastUpdatedBlock: holder.lastUpdatedBlock,
    });
  }

  const openQuote = priceQuoteX18FromSqrt({
    sqrtPriceX96: HELLO.openingSqrtPriceX96,
    tokenIsCurrency1: true,
    quoteDecimals: HELLO.quoteDecimals,
  });
  const closeQuote = priceQuoteX18FromSqrt({
    sqrtPriceX96: sqrtAfter,
    tokenIsCurrency1: true,
    quoteDecimals: HELLO.quoteDecimals,
  });
  const highQuote = openQuote > closeQuote ? openQuote : closeQuote;
  const lowQuote = openQuote < closeQuote ? openQuote : closeQuote;
  const bucketStart = Math.floor(Number(blockTimestamp) / 60) * 60;

  await upsertTokenMarketState(db, {
    chainId,
    tokenAddress: HELLO.token,
    poolId: HELLO.poolId,
    sqrtPriceX96: sqrtAfter,
    tick: tickAfter,
    priceQuoteX18: closeQuote,
    quoteUsdX18: null,
    priceUsdX18: null,
    fdvUsdX18: null,
    liquidityRaw: liqAfter,
    sourceBlock: blockNumber,
    sourceTxHash: txHash,
    sourceLogIndex: swapLogIndex,
  });

  await upsertCandle(db, {
    chainId,
    tokenAddress: HELLO.token,
    poolId: HELLO.poolId,
    interval: '1m',
    bucketStart,
    openQuoteX18: openQuote,
    highQuoteX18: highQuote,
    lowQuoteX18: lowQuote,
    closeQuoteX18: closeQuote,
    quoteVolumeRaw: quoteAmountRaw,
    tokenVolumeRaw: tokenAmountRaw,
    tradeCount: 1,
    buyCount: side === 'buy' ? 1 : 0,
    sellCount: side === 'sell' ? 1 : 0,
    openUsdX18: null,
    highUsdX18: null,
    lowUsdX18: null,
    closeUsdX18: null,
    usdVolumeX18: null,
    firstTradeBlock: blockNumber,
    lastTradeBlock: blockNumber,
  });

  await upsertAddressClassification(db, {
    chainId,
    address: HELLO.feeDistributor,
    class: 'fee_distributor',
    label: 'HELLO FeeDistributor',
    relatedToken: HELLO.token,
    relatedPool: HELLO.poolId,
    activeFromBlock: blockNumber,
  });
  await upsertAddressClassification(db, {
    chainId,
    address: HELLO.locker,
    class: 'liquidity_locker',
    label: 'HELLO LiquidityLocker',
    relatedToken: HELLO.token,
    relatedPool: HELLO.poolId,
    activeFromBlock: blockNumber,
  });

  await upsertIndexerCheckpoint(db, {
    chainId,
    streamName: HELLO.streamName,
    lastBlockNumber: blockNumber,
    lastBlockHash: blockHash,
    lastLogIndex: Math.max(...input.logs.map((l) => l.logIndex), -1),
  });

  await upsertIndexerHealth(db, {
    chainId,
    latestIndexedBlock: HELLO.blockNumber,
    lastRpcOkAt: new Date(),
    notes: 'HELLO vertical slice backfill complete — live indexing disabled',
  });
}
