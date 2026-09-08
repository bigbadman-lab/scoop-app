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
  upsertAddressClassification,
  getQuoteAssetDecimals,
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
  normalizeBytes32,
  getSqrtRatioAtTick,
  computeLaunchProgress,
} from '@scoop/shared';
import type { DecodedChainEvent } from './decode.js';
import { resolveUsdMarketFields } from './projections/usd.js';

export interface TokenMetadataInput {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint | string;
  description?: string;
  website?: string;
  logo?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  farcaster?: string;
  deployer: string;
  launchFactory: string;
}

export interface LaunchNormalizeInput {
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
  decoded: DecodedChainEvent[];
  tokenMeta: TokenMetadataInput;
  /** Explicit launch fields (from TokenLaunched / getLaunch / fixture). */
  launch: {
    tokenAddress: string;
    factoryAddress: string;
    deployerAddress: string;
    creatorId: string;
    quoteAsset: string;
    feeDistributorAddress: string;
    liquidityLockerAddress: string;
    poolId: string;
    lpTokenId: bigint | number | string;
    openingSqrtPriceX96: bigint | string;
    openingTick: number;
    tickLower: number;
    tickUpper: number;
    launchFeeRaw: bigint | string;
    initialBuyPresent: boolean;
    initialBuyQuoteRaw?: bigint | string | null;
    initialBuyTokensRaw?: bigint | string | null;
    launchLogIndex: number;
  };
  protocol: {
    poolManager: string;
    positionManager: string;
    universalRouter?: string;
    poolFee?: number;
    tickSpacing?: number;
    hooks?: string;
  };
  confirmationStatus?: string;
  dustRaw?: bigint;
  quoteUsdMaxAgeSeconds?: number;
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

/**
 * Shared launch normalize used by HELLO backfill and live TokenLaunched path.
 */
export async function normalizeLaunch(db: Queryable, input: LaunchNormalizeInput): Promise<void> {
  const chainId = input.chainId;
  const blockNumber = input.blockNumber;
  const blockHash = input.blockHash.toLowerCase();
  const blockTimestamp = input.blockTimestamp;
  const txHash = input.txHash.toLowerCase();
  const txFrom = normalizeAddress(input.txFrom);
  const token = normalizeAddress(input.launch.tokenAddress);
  const factory = normalizeAddress(input.launch.factoryAddress);
  const creator = normalizeAddress(input.launch.deployerAddress);
  const feeDistributor = normalizeAddress(input.launch.feeDistributorAddress);
  const locker = normalizeAddress(input.launch.liquidityLockerAddress);
  const poolId = normalizeBytes32(input.launch.poolId);
  const quoteAsset = normalizeAddress(input.launch.quoteAsset);
  const poolManager = normalizeAddress(input.protocol.poolManager);
  const positionManager = normalizeAddress(input.protocol.positionManager);
  const poolFee = input.protocol.poolFee ?? 10000;
  const tickSpacing = input.protocol.tickSpacing ?? 10;
  const hooks = normalizeAddress(input.protocol.hooks ?? ZERO_ADDRESS);
  const confirmationStatus = input.confirmationStatus ?? 'confirmed';
  const currency0 = quoteAsset;
  const currency1 = token;
  const tokenIsCurrency1 = true;
  const tokenDecimals = input.tokenMeta.decimals || 18;
  const quoteDecimals =
    (await getQuoteAssetDecimals(db, chainId, quoteAsset)) ?? 18;

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
      confirmationStatus,
      isCanonical: true,
    });
  }

  await upsertCreator(db, {
    chainId,
    creatorId: input.launch.creatorId,
    creatorType: 'wallet',
    walletAddress: creator,
    firstSeenBlock: blockNumber,
  });

  await upsertToken(db, {
    chainId,
    tokenAddress: token,
    name: input.tokenMeta.name,
    symbol: input.tokenMeta.symbol,
    decimals: tokenDecimals,
    totalSupplyRaw: input.tokenMeta.totalSupply,
    imageUri: input.tokenMeta.logo ?? '',
    description: input.tokenMeta.description ?? '',
    twitter: input.tokenMeta.twitter ?? '',
    telegram: input.tokenMeta.telegram ?? '',
    discord: input.tokenMeta.discord ?? '',
    website: input.tokenMeta.website ?? '',
    farcaster: input.tokenMeta.farcaster ?? '',
    deployerAddress: input.tokenMeta.deployer || creator,
    launchFactoryAddress: input.tokenMeta.launchFactory || factory,
    metadataSourceBlock: blockNumber,
  });

  await upsertLaunch(db, {
    chainId,
    tokenAddress: token,
    factoryAddress: factory,
    deployerAddress: creator,
    creatorId: input.launch.creatorId,
    quoteAsset,
    feeDistributorAddress: feeDistributor,
    liquidityLockerAddress: locker,
    poolId,
    lpTokenId: input.launch.lpTokenId,
    openingSqrtPriceX96: input.launch.openingSqrtPriceX96,
    openingTick: input.launch.openingTick,
    tickLower: input.launch.tickLower,
    tickUpper: input.launch.tickUpper,
    launchTxHash: txHash,
    launchBlock: blockNumber,
    launchLogIndex: input.launch.launchLogIndex,
    launchedAt: blockTimestamp,
    launchFeeRaw: input.launch.launchFeeRaw,
    initialBuyPresent: input.launch.initialBuyPresent,
    initialBuyQuoteRaw: input.launch.initialBuyQuoteRaw ?? null,
    initialBuyTokensRaw: input.launch.initialBuyTokensRaw ?? null,
    metadataHydrated: true,
  });

  const swapEvent = input.decoded.find((e) => e.kind === 'Swap');
  const fallbackQuote =
    input.launch.initialBuyQuoteRaw != null
      ? -BigInt(String(input.launch.initialBuyQuoteRaw))
      : 0n;
  const fallbackTokens =
    input.launch.initialBuyTokensRaw != null
      ? BigInt(String(input.launch.initialBuyTokensRaw))
      : 0n;

  const amount0 =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.amount0))
      : fallbackQuote;
  const amount1 =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.amount1))
      : fallbackTokens;
  const sqrtAfter =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.sqrtPriceX96))
      : BigInt(String(input.launch.openingSqrtPriceX96));
  const tickAfter =
    swapEvent && swapEvent.kind === 'Swap'
      ? Number(swapEvent.args.tick)
      : input.launch.openingTick;
  const liqAfter =
    swapEvent && swapEvent.kind === 'Swap'
      ? BigInt(String(swapEvent.args.liquidity))
      : 0n;
  const swapSender =
    swapEvent && swapEvent.kind === 'Swap'
      ? normalizeAddress(String(swapEvent.args.sender))
      : normalizeAddress(input.protocol.universalRouter ?? txFrom);
  const swapLogIndex =
    swapEvent && swapEvent.kind === 'Swap' ? swapEvent.logIndex : input.launch.launchLogIndex + 1;

  await upsertPool(db, {
    chainId,
    poolId,
    tokenAddress: token,
    quoteAsset,
    currency0,
    currency1,
    fee: poolFee,
    tickSpacing,
    hooks,
    lpTokenId: input.launch.lpTokenId,
    liquidityLockerAddress: locker,
    initializedTxHash: txHash,
    initializedBlock: blockNumber,
    initializedAt: blockTimestamp,
    openingSqrtPriceX96: input.launch.openingSqrtPriceX96,
    openingTick: input.launch.openingTick,
    currentSqrtPriceX96: sqrtAfter,
    currentTick: tickAfter,
    currentLiquidityRaw: liqAfter,
    lastSwapBlock: swapEvent ? blockNumber : null,
  });

  const hasTrade = amount0 !== 0n || amount1 !== 0n;
  let side: 'buy' | 'sell' = 'buy';
  let quoteAmountRaw = 0n;
  let tokenAmountRaw = 0n;
  let executionPrice = 0n;

  if (hasTrade) {
    side = classifyBuySell(amount0, amount1);
    quoteAmountRaw = amount0 < 0n ? -amount0 : amount0;
    tokenAmountRaw = amount1 < 0n ? -amount1 : amount1;
    if (tokenAmountRaw > 0n) {
      executionPrice = executionPriceQuoteX18({
        quoteAmountRaw,
        tokenAmountRaw,
        quoteDecimals,
        tokenDecimals,
      });
    }

    await upsertTrade(db, {
      chainId,
      txHash,
      logIndex: swapLogIndex,
      blockNumber,
      blockHash,
      blockTimestamp,
      poolId,
      tokenAddress: token,
      quoteAsset,
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
      fee: poolFee,
      executionPriceQuoteX18: executionPrice,
      quoteUsdX18: null,
      executionPriceUsdX18: null,
      usdValueX18: null,
      isInitialBuy: Boolean(input.launch.initialBuyPresent),
    });
  }

  const transferEvents = input.decoded.filter(
    (e): e is Extract<DecodedChainEvent, { kind: 'Transfer' }> =>
      e.kind === 'Transfer' && normalizeAddress(e.address) === token,
  );

  const holderTransfers = [];
  for (const ev of transferEvents) {
    const transferClass = classifyTransfer({
      from: ev.args.from,
      to: ev.args.to,
      amount: ev.args.value,
      factory,
      creator,
      poolManager,
      dead: DEAD_ADDRESS,
      zero: ZERO_ADDRESS,
    });

    await upsertTransfer(db, {
      chainId,
      tokenAddress: token,
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
    factory,
    poolManager,
    positionManager,
    locker,
    feeDistributor,
    DEAD_ADDRESS,
    ZERO_ADDRESS,
  ]);

  let holderCountAll = 0;
  let holderCountRetail = 0;
  for (const holder of holders) {
    const isSystem = system.has(holder.address);
    await upsertHolderBalance(db, {
      chainId,
      tokenAddress: token,
      holderAddress: holder.address,
      balanceRaw: holder.balanceRaw,
      holderClass: isSystem ? 'system' : 'user',
      isSystemAddress: isSystem,
      firstSeenBlock: holder.firstSeenBlock,
      lastUpdatedBlock: holder.lastUpdatedBlock,
    });
    holderCountAll += 1;
    if (!isSystem) holderCountRetail += 1;
  }

  const openingSqrt = BigInt(String(input.launch.openingSqrtPriceX96));
  const openQuote = priceQuoteX18FromSqrt({
    sqrtPriceX96: openingSqrt,
    tokenIsCurrency1,
    quoteDecimals,
    tokenDecimals,
  });
  const closeQuote = priceQuoteX18FromSqrt({
    sqrtPriceX96: sqrtAfter,
    tokenIsCurrency1,
    quoteDecimals,
    tokenDecimals,
  });
  const highQuote = openQuote > closeQuote ? openQuote : closeQuote;
  const lowQuote = openQuote < closeQuote ? openQuote : closeQuote;
  const bucketStart = Math.floor(Number(blockTimestamp) / 60) * 60;

  const sqrtLower = getSqrtRatioAtTick(input.launch.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(input.launch.tickUpper);
  const progress = computeLaunchProgress({
    liquidity: liqAfter > 0n ? liqAfter : 1n,
    sqrtPriceX96: sqrtAfter,
    sqrtLower,
    sqrtUpper,
    tokenIsCurrency1,
    openingSqrtPriceX96: openingSqrt,
    dustRaw: input.dustRaw,
  });

  // Prefer inventory computed at opening with post-swap liquidity when available
  const progressFinal =
    liqAfter > 0n
      ? progress
      : {
          ...progress,
          progressBps: 0,
          complete: false,
          initialTokenInventory: progress.initialTokenInventory,
          currentTokenInventory: progress.currentTokenInventory,
        };

  const totalSupplyRaw = BigInt(String(input.tokenMeta.totalSupply));
  const usd = await resolveUsdMarketFields(db, {
    chainId,
    quoteAsset,
    priceQuoteX18: closeQuote,
    totalSupplyRaw,
    tokenDecimals,
    maxAgeSeconds: input.quoteUsdMaxAgeSeconds ?? 300,
    nowMs: Number(blockTimestamp) * 1000,
  });

  await upsertTokenMarketState(db, {
    chainId,
    tokenAddress: token,
    poolId,
    sqrtPriceX96: sqrtAfter,
    tick: tickAfter,
    priceQuoteX18: closeQuote,
    quoteUsdX18: usd.quoteUsdX18,
    priceUsdX18: usd.priceUsdX18,
    fdvUsdX18: usd.fdvUsdX18,
    liquidityRaw: liqAfter,
    sourceBlock: blockNumber,
    sourceTxHash: txHash,
    sourceLogIndex: hasTrade ? swapLogIndex : input.launch.launchLogIndex,
    launchProgressBps: progressFinal.progressBps,
    launchComplete: progressFinal.complete,
    lastTradeAt: hasTrade ? blockTimestamp : null,
    lastTradeBlock: hasTrade ? blockNumber : null,
    tradeCountAllTime: hasTrade ? 1 : 0,
    buyCountAllTime: hasTrade && side === 'buy' ? 1 : 0,
    sellCountAllTime: hasTrade && side === 'sell' ? 1 : 0,
    quoteVolumeAllTimeRaw: hasTrade ? quoteAmountRaw : 0n,
    tokenVolumeAllTimeRaw: hasTrade ? tokenAmountRaw : 0n,
    volume24hQuoteRaw: hasTrade ? quoteAmountRaw : 0n,
    tradeCount24h: hasTrade ? 1 : 0,
    buyCount24h: hasTrade && side === 'buy' ? 1 : 0,
    sellCount24h: hasTrade && side === 'sell' ? 1 : 0,
    priceChange24hBps: null,
    holderCountAll,
    holderCountRetail,
    initialTokenInventoryRaw: progressFinal.initialTokenInventory,
    currentTokenInventoryRaw: progressFinal.currentTokenInventory,
  });

  if (hasTrade) {
    await upsertCandle(db, {
      chainId,
      tokenAddress: token,
      poolId,
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
  }

  await upsertAddressClassification(db, {
    chainId,
    address: feeDistributor,
    class: 'fee_distributor',
    label: 'FeeDistributor',
    relatedToken: token,
    relatedPool: poolId,
    activeFromBlock: blockNumber,
  });
  await upsertAddressClassification(db, {
    chainId,
    address: locker,
    class: 'liquidity_locker',
    label: 'LiquidityLocker',
    relatedToken: token,
    relatedPool: poolId,
    activeFromBlock: blockNumber,
  });
}
