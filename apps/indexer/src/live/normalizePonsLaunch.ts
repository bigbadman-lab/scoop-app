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
  notionalUsdX18FromQuoteAmount,
} from '@scoop/shared';
import { PONS_V2_FACTORY_ADDRESS } from '@scoop/contracts';
import type { TokenMetadataInput } from './normalizeLaunch.js';
import type { DecodedPonsEvent } from './decodePons.js';
import { resolveTradeUsdFields, resolveUsdMarketFields } from './projections/usd.js';

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
  /** Product max age for quote/USD snapshots (same as Scoop UV4 path). */
  quoteUsdMaxAgeSeconds?: number;
  /**
   * Optional on-curve spot when no CurveBuy in receipt (quoteReserve/tokenReserve).
   * Must be derived from chain state — never invented.
   */
  reservePriceQuoteX18?: bigint | null;
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

  // Spot from initial CurveBuy, else optional on-curve reserve ratio.
  let priceQuoteX18 = BigInt(0);
  if (
    initialBuyTokens != null &&
    initialBuyQuote != null &&
    initialBuyTokens > BigInt(0)
  ) {
    priceQuoteX18 = curveExecutionPriceQuoteX18(initialBuyQuote, initialBuyTokens);
  } else if (
    input.reservePriceQuoteX18 != null &&
    input.reservePriceQuoteX18 > BigInt(0)
  ) {
    priceQuoteX18 = input.reservePriceQuoteX18;
  }

  const quoteUsdMaxAgeSeconds = input.quoteUsdMaxAgeSeconds ?? 300;
  const totalSupplyRaw = BigInt(String(input.tokenMeta.totalSupply));
  const tokenDecimals = input.tokenMeta.decimals || 18;
  const quoteDecimalsRow = await db.query<{ decimals: number | null }>(
    `SELECT decimals FROM quote_assets WHERE chain_id = $1 AND quote_asset = $2`,
    [input.chainId, quoteAsset],
  );
  const quoteDecimals = Number(quoteDecimalsRow.rows[0]?.decimals ?? 18);

  // Index CurveBuy / CurveSell in this receipt (refunds stored as raw events only).
  for (const ev of input.decoded) {
    if (ev.kind === 'CurveBuy') {
      const quoteAmount = ev.args.quoteIn;
      const tokenAmount = ev.args.tokensOut;
      const exec = curveExecutionPriceQuoteX18(quoteAmount, tokenAmount);
      const tradeUsd = await resolveTradeUsdFields(db, {
        chainId: input.chainId,
        quoteAsset,
        quoteAmountRaw: quoteAmount,
        executionPriceQuoteX18: exec,
        quoteDecimals,
        tradeTimestampSec: Number(input.blockTimestamp),
        maxAgeSeconds: quoteUsdMaxAgeSeconds,
      });
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
        quoteUsdX18: tradeUsd.quoteUsdX18,
        executionPriceUsdX18: tradeUsd.executionPriceUsdX18,
        usdValueX18: tradeUsd.usdValueX18,
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
      const tradeUsd = await resolveTradeUsdFields(db, {
        chainId: input.chainId,
        quoteAsset,
        quoteAmountRaw: quoteAmount,
        executionPriceQuoteX18: exec,
        quoteDecimals,
        tradeTimestampSec: Number(input.blockTimestamp),
        maxAgeSeconds: quoteUsdMaxAgeSeconds,
      });
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
        quoteUsdX18: tradeUsd.quoteUsdX18,
        executionPriceUsdX18: tradeUsd.executionPriceUsdX18,
        usdValueX18: tradeUsd.usdValueX18,
        isInitialBuy: false,
      });
    }
    // CurveBuyRefunded: raw event only — must not inflate volume.
  }

  // Refresh aggregate counters + canonical USD/FDV (same helpers as Scoop UV4).
  await refreshPonsMarketActivity(db, {
    chainId: input.chainId,
    tokenAddress,
    syntheticPoolId,
    blockNumber: input.blockNumber,
    priceQuoteX18,
    quoteAsset,
    totalSupplyRaw,
    tokenDecimals,
    quoteDecimals,
    quoteUsdMaxAgeSeconds,
    nowMs: Number(input.blockTimestamp) * 1000,
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
    quoteAsset?: string;
    totalSupplyRaw?: bigint;
    tokenDecimals?: number;
    quoteDecimals?: number;
    quoteUsdMaxAgeSeconds?: number;
    nowMs?: number;
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
    usd_volume: string | null;
  }>(
    `
    SELECT
      COUNT(*)::text AS trade_count,
      COUNT(*) FILTER (WHERE side = 'buy')::text AS buy_count,
      COUNT(*) FILTER (WHERE side = 'sell')::text AS sell_count,
      COALESCE(SUM(quote_amount_raw), 0)::text AS quote_volume,
      COALESCE(SUM(token_amount_raw), 0)::text AS token_volume,
      MAX(block_timestamp)::text AS last_trade_at,
      SUM(usd_value_x18)::text AS usd_volume
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
  const priceQuoteX18 = price == null ? BigInt(0) : BigInt(price);

  let quoteAsset = args.quoteAsset ? normalizeAddress(args.quoteAsset) : null;
  let totalSupplyRaw = args.totalSupplyRaw;
  let tokenDecimals = args.tokenDecimals;
  let quoteDecimals = args.quoteDecimals;

  if (!quoteAsset || totalSupplyRaw == null || tokenDecimals == null) {
    const meta = await db.query<{
      quote_asset: string;
      total_supply_raw: string;
      decimals: number;
      quote_decimals: number | null;
    }>(
      `
      SELECT l.quote_asset,
             t.total_supply_raw::text AS total_supply_raw,
             t.decimals,
             q.decimals AS quote_decimals
      FROM launches l
      JOIN tokens t
        ON t.chain_id = l.chain_id AND t.token_address = l.token_address
      LEFT JOIN quote_assets q
        ON q.chain_id = l.chain_id AND q.quote_asset = l.quote_asset
      WHERE l.chain_id = $1 AND l.token_address = $2
      `,
      [args.chainId, token],
    );
    const m = meta.rows[0];
    if (m) {
      quoteAsset = quoteAsset ?? normalizeAddress(m.quote_asset);
      totalSupplyRaw = totalSupplyRaw ?? BigInt(m.total_supply_raw);
      tokenDecimals = tokenDecimals ?? Number(m.decimals);
      quoteDecimals = quoteDecimals ?? Number(m.quote_decimals ?? 18);
    }
  }

  let quoteUsdX18: bigint | null = null;
  let priceUsdX18: bigint | null = null;
  let fdvUsdX18: bigint | null = null;
  let volume24hUsdX18: bigint | null = null;

  if (
    quoteAsset &&
    totalSupplyRaw != null &&
    tokenDecimals != null
  ) {
    const usd = await resolveUsdMarketFields(db, {
      chainId: args.chainId,
      quoteAsset,
      priceQuoteX18,
      totalSupplyRaw,
      tokenDecimals,
      maxAgeSeconds: args.quoteUsdMaxAgeSeconds ?? 300,
      nowMs: args.nowMs,
    });
    quoteUsdX18 = usd.quoteUsdX18;
    priceUsdX18 = usd.priceUsdX18;
    fdvUsdX18 = usd.fdvUsdX18;

    if (row?.usd_volume != null && row.usd_volume !== '') {
      volume24hUsdX18 = BigInt(row.usd_volume);
    } else if (quoteUsdX18 != null && quoteUsdX18 > 0n) {
      volume24hUsdX18 = notionalUsdX18FromQuoteAmount({
        quoteAmountRaw: BigInt(row?.quote_volume ?? '0'),
        quoteUsdX18,
        quoteDecimals: quoteDecimals ?? 18,
      });
    }
  }

  await upsertTokenMarketState(db, {
    chainId: args.chainId,
    tokenAddress: token,
    poolId: normalizeBytes32(args.syntheticPoolId),
    sqrtPriceX96: BigInt(0),
    tick: 0,
    priceQuoteX18,
    quoteUsdX18,
    priceUsdX18,
    fdvUsdX18,
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
    volume24hUsdX18,
    tradeCount24h: Number(row?.trade_count ?? 0),
    buyCount24h: Number(row?.buy_count ?? 0),
    sellCount24h: Number(row?.sell_count ?? 0),
    priceChange24hBps: null,
  });
}
