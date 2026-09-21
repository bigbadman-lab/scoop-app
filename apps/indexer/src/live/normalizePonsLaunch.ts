/**
 * Normalize Pons V2 TokenLaunched (+ optional CurveBuy in same receipt) into SCOOP tables.
 * Does not invent Scoop UV4 pool / fee-distributor / locker rows.
 */
import type { Queryable } from '@scoop/db';
import {
  upsertRawChainEvent,
  upsertLaunch,
  upsertToken,
  upsertCreator,
  upsertTrade,
  upsertTokenMarketState,
  applyBoundDisplayImageOnTokenInsert,
} from '@scoop/db';
import {
  creatorIdFromWallet,
  curveSyntheticPoolId,
  normalizeAddress,
  normalizeBytes32,
} from '@scoop/shared';
import { PONS_V2_FACTORY_ADDRESS } from '@scoop/contracts';
import type { TokenMetadataInput } from './normalizeLaunch.js';
import type { DecodedPonsEvent } from './decodePons.js';

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

/** quote/token execution price as quote * 1e18 / tokens (integer). */
export function curveExecutionPriceQuoteX18(
  quoteAmount: bigint,
  tokenAmount: bigint,
): bigint {
  if (tokenAmount <= BigInt(0)) return BigInt(0);
  return (quoteAmount * BigInt(10) ** BigInt(18)) / tokenAmount;
}

export interface PonsLaunchNormalizeInput {
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
  decoded: DecodedPonsEvent[];
  tokenMeta: TokenMetadataInput;
  launch: {
    tokenAddress: string;
    curveAddress: string;
    deployerAddress: string;
    pairToken: string;
    launchConfigId: bigint;
    graduationThreshold: bigint;
    launchLogIndex: number;
    launchFeeRaw?: bigint;
    initialBuyQuoteRaw?: bigint | null;
    initialBuyTokensRaw?: bigint | null;
  };
  confirmationStatus?: string;
}

export async function normalizePonsLaunch(
  db: Queryable,
  input: PonsLaunchNormalizeInput,
): Promise<void> {
  const factory = normalizeAddress(PONS_V2_FACTORY_ADDRESS);
  const tokenAddress = normalizeAddress(input.launch.tokenAddress);
  const curveAddress = normalizeAddress(input.launch.curveAddress);
  const deployer = normalizeAddress(input.launch.deployerAddress);
  const quoteAsset = normalizeAddress(input.launch.pairToken);
  const creatorId = creatorIdFromWallet(deployer);
  const syntheticPoolId = curveSyntheticPoolId(curveAddress);

  for (const log of input.logs) {
    const matched = input.decoded.find(
      (d) =>
        d.logIndex === log.logIndex &&
        normalizeAddress(d.address) === normalizeAddress(log.address),
    );
    await upsertRawChainEvent(db, {
      chainId: input.chainId,
      blockNumber: input.blockNumber,
      blockHash: input.blockHash,
      blockTimestamp: input.blockTimestamp,
      txHash: input.txHash,
      txIndex: input.txIndex,
      logIndex: log.logIndex,
      contractAddress: log.address,
      topic0: log.topics[0] ?? '0x' + '0'.repeat(64),
      topics: log.topics,
      data: log.data,
      decodedEventName: matched && matched.kind !== 'unknown' ? matched.kind : null,
      decodedPayload: matched && matched.kind !== 'unknown' ? jsonSafe(matched.args) : null,
      confirmationStatus: input.confirmationStatus ?? 'confirmed',
    });
  }

  await upsertCreator(db, {
    chainId: input.chainId,
    creatorId,
    creatorType: 'wallet',
    walletAddress: deployer,
    firstSeenBlock: input.blockNumber,
  });

  await upsertToken(db, {
    chainId: input.chainId,
    tokenAddress,
    name: input.tokenMeta.name,
    symbol: input.tokenMeta.symbol,
    decimals: input.tokenMeta.decimals,
    totalSupplyRaw: input.tokenMeta.totalSupply,
    imageUri: input.tokenMeta.logo ?? '',
    description: input.tokenMeta.description ?? '',
    twitter: input.tokenMeta.twitter ?? '',
    telegram: input.tokenMeta.telegram ?? '',
    discord: input.tokenMeta.discord ?? '',
    website: input.tokenMeta.website ?? '',
    farcaster: input.tokenMeta.farcaster ?? '',
    deployerAddress: deployer,
    launchFactoryAddress: factory,
    metadataSourceBlock: input.blockNumber,
  });

  await applyBoundDisplayImageOnTokenInsert(db, {
    chainId: input.chainId,
    tokenAddress,
    imageUri: input.tokenMeta.logo ?? '',
  });

  const initialBuy = input.decoded.find((e) => e.kind === 'CurveBuy');
  const initialBuyQuote =
    input.launch.initialBuyQuoteRaw ??
    (initialBuy && initialBuy.kind === 'CurveBuy' ? initialBuy.args.quoteIn : null);
  const initialBuyTokens =
    input.launch.initialBuyTokensRaw ??
    (initialBuy && initialBuy.kind === 'CurveBuy' ? initialBuy.args.tokensOut : null);

  await upsertLaunch(db, {
    chainId: input.chainId,
    tokenAddress,
    factoryAddress: factory,
    deployerAddress: deployer,
    creatorId,
    quoteAsset,
    feeDistributorAddress: null,
    liquidityLockerAddress: null,
    poolId: null, // no UV4 pool pre-graduation
    lpTokenId: null,
    openingSqrtPriceX96: null,
    openingTick: null,
    tickLower: null,
    tickUpper: null,
    launchTxHash: input.txHash,
    launchBlock: input.blockNumber,
    launchLogIndex: input.launch.launchLogIndex,
    launchedAt: input.blockTimestamp,
    launchFeeRaw: input.launch.launchFeeRaw ?? BigInt(0),
    initialBuyPresent: Boolean(initialBuyQuote && initialBuyQuote > BigInt(0)),
    initialBuyQuoteRaw: initialBuyQuote,
    initialBuyTokensRaw: initialBuyTokens,
    metadataHydrated: true,
    additionalFee: 0,
    totalPoolFee: 0,
    marketSource: 'pons_v2',
    curveAddress,
    launchConfigId: input.launch.launchConfigId,
    graduationThresholdRaw: input.launch.graduationThreshold,
    graduationStatus: 'curve',
  });

  // Market state: activity counters only — no UV4 price/FDV invention.
  let priceQuoteX18 = BigInt(0);
  if (
    initialBuyTokens != null &&
    initialBuyQuote != null &&
    initialBuyTokens > BigInt(0)
  ) {
    priceQuoteX18 = curveExecutionPriceQuoteX18(initialBuyQuote, initialBuyTokens);
  }

  await upsertTokenMarketState(db, {
    chainId: input.chainId,
    tokenAddress,
    poolId: syntheticPoolId,
    sqrtPriceX96: BigInt(0),
    tick: 0,
    priceQuoteX18,
    quoteUsdX18: null,
    priceUsdX18: null,
    fdvUsdX18: null,
    liquidityRaw: BigInt(0),
    sourceBlock: input.blockNumber,
    sourceTxHash: input.txHash,
    sourceLogIndex: input.launch.launchLogIndex,
    launchProgressBps: 0,
    launchComplete: false,
    tradeCountAllTime: 0,
    buyCountAllTime: 0,
    sellCountAllTime: 0,
    quoteVolumeAllTimeRaw: BigInt(0),
    tokenVolumeAllTimeRaw: BigInt(0),
    volume24hQuoteRaw: BigInt(0),
    volume24hUsdX18: null,
    tradeCount24h: 0,
    buyCount24h: 0,
    sellCount24h: 0,
    priceChange24hBps: null,
  });

  // Index CurveBuy / CurveSell in this receipt (refunds stored as raw events only).
  for (const ev of input.decoded) {
    if (ev.kind === 'CurveBuy') {
      const quoteAmount = ev.args.quoteIn;
      const tokenAmount = ev.args.tokensOut;
      const exec = curveExecutionPriceQuoteX18(quoteAmount, tokenAmount);
      await upsertTrade(db, {
        chainId: input.chainId,
        txHash: input.txHash,
        logIndex: ev.logIndex,
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        blockTimestamp: input.blockTimestamp,
        poolId: syntheticPoolId,
        tokenAddress,
        quoteAsset,
        swapSender: ev.args.buyer,
        txFrom: input.txFrom,
        traderAddress: ev.args.recipient,
        traderAttributionType: 'curve_buy',
        side: 'buy',
        amount0Raw: BigInt(0),
        amount1Raw: BigInt(0),
        quoteAmountRaw: quoteAmount,
        tokenAmountRaw: tokenAmount,
        sqrtPriceX96After: BigInt(0),
        tickAfter: 0,
        liquidityAfterRaw: BigInt(0),
        fee: ev.args.fee,
        executionPriceQuoteX18: exec,
        quoteUsdX18: null,
        executionPriceUsdX18: null,
        usdValueX18: null,
        isInitialBuy: Boolean(
          initialBuyQuote &&
            initialBuyQuote > BigInt(0) &&
            quoteAmount === initialBuyQuote &&
            tokenAmount === (initialBuyTokens ?? BigInt(0)),
        ),
      });
    } else if (ev.kind === 'CurveSell') {
      const quoteAmount = ev.args.quoteOut;
      const tokenAmount = ev.args.tokensIn;
      const exec = curveExecutionPriceQuoteX18(quoteAmount, tokenAmount);
      await upsertTrade(db, {
        chainId: input.chainId,
        txHash: input.txHash,
        logIndex: ev.logIndex,
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        blockTimestamp: input.blockTimestamp,
        poolId: syntheticPoolId,
        tokenAddress,
        quoteAsset,
        swapSender: ev.args.seller,
        txFrom: input.txFrom,
        traderAddress: ev.args.recipient,
        traderAttributionType: 'curve_sell',
        side: 'sell',
        amount0Raw: BigInt(0),
        amount1Raw: BigInt(0),
        quoteAmountRaw: quoteAmount,
        tokenAmountRaw: tokenAmount,
        sqrtPriceX96After: BigInt(0),
        tickAfter: 0,
        liquidityAfterRaw: BigInt(0),
        fee: ev.args.fee,
        executionPriceQuoteX18: exec,
        quoteUsdX18: null,
        executionPriceUsdX18: null,
        usdValueX18: null,
        isInitialBuy: false,
      });
    }
    // CurveBuyRefunded: raw event only — must not inflate volume.
  }

  // Refresh aggregate counters from trades inserted above (simple pass).
  await refreshPonsMarketActivity(db, {
    chainId: input.chainId,
    tokenAddress,
    syntheticPoolId,
    blockNumber: input.blockNumber,
    priceQuoteX18,
  });
}

export async function refreshPonsMarketActivity(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    syntheticPoolId: string;
    blockNumber: bigint;
    priceQuoteX18?: bigint;
  },
): Promise<void> {
  const token = normalizeAddress(args.tokenAddress);
  const agg = await db.query<{
    trade_count: string;
    buy_count: string;
    sell_count: string;
    quote_volume: string;
    token_volume: string;
    last_trade_at: string | null;
  }>(
    `
    SELECT
      COUNT(*)::text AS trade_count,
      COUNT(*) FILTER (WHERE side = 'buy')::text AS buy_count,
      COUNT(*) FILTER (WHERE side = 'sell')::text AS sell_count,
      COALESCE(SUM(quote_amount_raw), 0)::text AS quote_volume,
      COALESCE(SUM(token_amount_raw), 0)::text AS token_volume,
      MAX(block_timestamp)::text AS last_trade_at
    FROM trades
    WHERE chain_id = $1 AND token_address = $2
    `,
    [args.chainId, token],
  );
  const row = agg.rows[0];
  const price =
    args.priceQuoteX18 ??
    (
      await db.query<{ p: string | null }>(
        `SELECT execution_price_quote_x18::text AS p FROM trades
         WHERE chain_id = $1 AND token_address = $2
         ORDER BY block_timestamp DESC, log_index DESC LIMIT 1`,
        [args.chainId, token],
      )
    ).rows[0]?.p;

  await upsertTokenMarketState(db, {
    chainId: args.chainId,
    tokenAddress: token,
    poolId: normalizeBytes32(args.syntheticPoolId),
    sqrtPriceX96: BigInt(0),
    tick: 0,
    priceQuoteX18: price == null ? BigInt(0) : BigInt(price),
    quoteUsdX18: null,
    priceUsdX18: null,
    fdvUsdX18: null,
    liquidityRaw: BigInt(0),
    sourceBlock: args.blockNumber,
    launchProgressBps: 0,
    launchComplete: false,
    lastTradeAt: row?.last_trade_at == null ? null : Number(row.last_trade_at),
    tradeCountAllTime: Number(row?.trade_count ?? 0),
    buyCountAllTime: Number(row?.buy_count ?? 0),
    sellCountAllTime: Number(row?.sell_count ?? 0),
    quoteVolumeAllTimeRaw: row?.quote_volume ?? '0',
    tokenVolumeAllTimeRaw: row?.token_volume ?? '0',
    volume24hQuoteRaw: row?.quote_volume ?? '0',
    volume24hUsdX18: null,
    tradeCount24h: Number(row?.trade_count ?? 0),
    buyCount24h: Number(row?.buy_count ?? 0),
    sellCount24h: Number(row?.sell_count ?? 0),
    priceChange24hBps: null,
  });
}
