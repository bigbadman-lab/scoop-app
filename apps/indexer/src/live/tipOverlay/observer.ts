import type { Pool, Queryable } from '@scoop/db';
import {
  expireLiveOverlayRows,
  getIndexerMainCheckpointBlock,
  getLiveObserverCheckpoint,
  getQuoteAssetDecimals,
  lookupLiveDisplayImageUrl,
  normalizeAddress,
  normalizeBytes32,
  setLiveObserverCheckpoint,
  upsertLiveChainEvent,
  upsertLiveTokenTip,
  withTransaction,
} from '@scoop/db';
import {
  BASE_FEE,
  TICK_SPACING,
  ZERO_ADDRESS,
  classifyBuySell,
  executionPriceQuoteX18,
  fdvUsdX18FromPrice,
  quoteAndTokenAmountsFromSwapDeltas,
  resolvePoolOrientation,
} from '@scoop/shared';
import type { Hex, PublicClient } from 'viem';
import type { IndexerConfig } from '../../config.js';
import { requireIndexerCanonicalDeployment } from '../../deployment.js';
import { decodeLog } from '../decode.js';
import { hydrateLaunchView, hydrateTokenMetadata } from '../hydrate.js';
import { resolveTradeUsdFields } from '../projections/usd.js';
import { createFailoverRpc } from '../rpc/failover.js';
import { loadWatchlist, watchlistAddLaunch } from '../watchlist.js';
import { resolveLiveScanWindow } from './scanWindow.js';

type ObserverArgs = {
  config: IndexerConfig;
  pool: Pool;
  signal: AbortSignal;
};

function logJson(level: 'info' | 'warn', message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields }));
}

function jsonSafe(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value ?? {}, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as Record<string, unknown>;
}

function ipfsGatewayUrl(imageUri: string | null | undefined): string | null {
  const trimmed = imageUri?.trim();
  if (!trimmed || !/^ipfs:\/\//i.test(trimmed)) return null;
  let path = trimmed.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '');
  path = path.replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\')) return null;
  return `https://ipfs.io/ipfs/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function blockTimestamp(
  client: PublicClient,
  blockNumber: bigint,
  cache: Map<bigint, { hash: string; timestamp: bigint }>,
): Promise<{ hash: string; timestamp: bigint }> {
  const cached = cache.get(blockNumber);
  if (cached) return cached;
  const block = await client.getBlock({ blockNumber, includeTransactions: false });
  const value = {
    hash: normalizeBytes32(block.hash!),
    timestamp: block.timestamp,
  };
  cache.set(blockNumber, value);
  return value;
}

async function observeRange(args: {
  db: Queryable;
  client: PublicClient;
  config: IndexerConfig;
  fromBlock: bigint;
  toBlock: bigint;
  watchlist: Awaited<ReturnType<typeof loadWatchlist>>;
}): Promise<{ rpcMs: number; decodeMs: number; writeMs: number }> {
  const { db, client, config, fromBlock, toBlock, watchlist } = args;
  const deployment = requireIndexerCanonicalDeployment();
  const addresses = [deployment.factory, deployment.poolManager] as Hex[];
  const rpcStartedAt = Date.now();
  const logs = await client.getLogs({ address: addresses, fromBlock, toBlock });
  const rpcMs = Date.now() - rpcStartedAt;
  const decodeStartedAt = Date.now();
  const decodedLogs = logs.map((log) => ({ log, decoded: decodeLog(log) }));
  const decodeMs = Date.now() - decodeStartedAt;
  const writeStartedAt = Date.now();
  const cache = new Map<bigint, { hash: string; timestamp: bigint }>();

  // Launches first so swaps later in the same range can resolve their pool.
  for (const { log, decoded } of decodedLogs) {
    if (
      decoded.kind !== 'TokenLaunched' ||
      normalizeAddress(decoded.address) !== deployment.factory ||
      log.blockNumber == null ||
      !log.transactionHash
    ) {
      continue;
    }
    const tokenAddress = normalizeAddress(String(decoded.args.token));
    const txHash = normalizeBytes32(log.transactionHash);
    const block = await blockTimestamp(client, log.blockNumber, cache);
    const observedAt = Date.now();
    const [metadata, launch] = await Promise.all([
      hydrateTokenMetadata(client, tokenAddress),
      hydrateLaunchView(client, tokenAddress),
    ]);
    const [storedDisplayImageUrl, quoteDecimals] = await Promise.all([
      metadata.logo
        ? lookupLiveDisplayImageUrl(db, metadata.logo, config.SUPABASE_URL)
        : Promise.resolve(null),
      getQuoteAssetDecimals(db, config.SCOOP_CHAIN_ID, launch.quoteAsset).then(
        (value) => value ?? 18,
      ),
    ]);
    const displayImageUrl = storedDisplayImageUrl ?? ipfsGatewayUrl(metadata.logo);
    const payload = jsonSafe({
      ...decoded.args,
      totalSupplyRaw: metadata.totalSupply,
      logo: metadata.logo,
      description: metadata.description,
      twitter: metadata.twitter,
      telegram: metadata.telegram,
      discord: metadata.discord,
      website: metadata.website,
      farcaster: metadata.farcaster,
    });
    await upsertLiveChainEvent(db, {
      chainId: config.SCOOP_CHAIN_ID,
      blockNumber: log.blockNumber,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      txHash,
      logIndex: decoded.logIndex,
      eventKind: 'TokenLaunched',
      tokenAddress,
      poolId: launch.poolId,
      quoteAsset: launch.quoteAsset,
      payload,
      ttlSeconds: config.SCOOP_LIVE_TTL_SECONDS,
    });
    await upsertLiveTokenTip(db, {
      chainId: config.SCOOP_CHAIN_ID,
      tokenAddress,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      imageUri: metadata.logo,
      displayImageUrl,
      poolId: launch.poolId,
      quoteAsset: launch.quoteAsset,
      creatorId: launch.creatorId,
      deployerAddress: launch.deployer,
      factoryAddress: deployment.factory,
      launchedAt: block.timestamp,
      launchTxHash: txHash,
      sourceBlock: log.blockNumber,
      sourceTxHash: txHash,
      sourceLogIndex: decoded.logIndex,
      ttlSeconds: config.SCOOP_LIVE_TTL_SECONDS,
    });
    const orientation = resolvePoolOrientation({
      tokenAddress,
      quoteAsset: launch.quoteAsset,
    });
    watchlistAddLaunch(watchlist, {
      chainId: config.SCOOP_CHAIN_ID,
      tokenAddress,
      poolId: launch.poolId,
      feeDistributorAddress: launch.feeDistributor,
      liquidityLockerAddress: launch.liquidityLocker,
      quoteAsset: launch.quoteAsset,
      factoryAddress: deployment.factory,
      deployerAddress: launch.deployer,
      creatorId: launch.creatorId,
      tickLower: launch.tickLower,
      tickUpper: launch.tickUpper,
      openingSqrtPriceX96: launch.openingSqrtPriceX96.toString(),
      lpTokenId: launch.lpTokenId.toString(),
      currency0: orientation.currency0,
      currency1: orientation.currency1,
      fee: BASE_FEE,
      tickSpacing: TICK_SPACING,
      hooks: ZERO_ADDRESS,
      tokenIsCurrency1: orientation.tokenIsCurrency1,
      tokenDecimals: metadata.decimals || 18,
      quoteDecimals,
    });
    logJson('info', 'live overlay event observed', {
      eventType: 'TokenLaunched',
      chainId: config.SCOOP_CHAIN_ID,
      blockNumber: log.blockNumber.toString(),
      txHash,
      logIndex: decoded.logIndex,
      observedAt: new Date(observedAt).toISOString(),
      blockTimestamp: Number(block.timestamp),
      latencyMs: Math.max(0, observedAt - Number(block.timestamp) * 1000),
      source: 'live',
    });
  }

  for (const { log, decoded } of decodedLogs) {
    if (
      decoded.kind !== 'Swap' ||
      normalizeAddress(decoded.address) !== deployment.poolManager ||
      log.blockNumber == null ||
      !log.transactionHash
    ) {
      continue;
    }
    const poolId = normalizeBytes32(String(decoded.args.id ?? decoded.args.poolId ?? ''));
    const entry = watchlist.pools.get(poolId);
    if (!entry) continue;
    const amount0 = BigInt(String(decoded.args.amount0));
    const amount1 = BigInt(String(decoded.args.amount1));
    const side = classifyBuySell(amount0, amount1, entry.tokenIsCurrency1);
    const amounts = quoteAndTokenAmountsFromSwapDeltas({
      amount0,
      amount1,
      tokenIsCurrency1: entry.tokenIsCurrency1,
    });
    if (amounts.tokenAmountRaw <= 0n) continue;
    const executionPrice = executionPriceQuoteX18({
      ...amounts,
      quoteDecimals: entry.quoteDecimals,
      tokenDecimals: entry.tokenDecimals,
    });
    const block = await blockTimestamp(client, log.blockNumber, cache);
    const tradeUsd = await resolveTradeUsdFields(db, {
      chainId: config.SCOOP_CHAIN_ID,
      quoteAsset: entry.quoteAsset,
      quoteAmountRaw: amounts.quoteAmountRaw,
      executionPriceQuoteX18: executionPrice,
      quoteDecimals: entry.quoteDecimals,
      tradeTimestampSec: Number(block.timestamp),
      maxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
    });
    const txHash = normalizeBytes32(log.transactionHash);
    const observedAt = Date.now();
    const inserted = await upsertLiveChainEvent(db, {
      chainId: config.SCOOP_CHAIN_ID,
      blockNumber: log.blockNumber,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      txHash,
      logIndex: decoded.logIndex,
      eventKind: 'Swap',
      tokenAddress: entry.tokenAddress,
      poolId,
      quoteAsset: entry.quoteAsset,
      side,
      quoteAmountRaw: amounts.quoteAmountRaw,
      tokenAmountRaw: amounts.tokenAmountRaw,
      executionPriceQuoteX18: executionPrice,
      executionPriceUsdX18: tradeUsd.executionPriceUsdX18,
      usdValueX18: tradeUsd.usdValueX18,
      sqrtPriceX96: BigInt(String(decoded.args.sqrtPriceX96)),
      payload: jsonSafe({ ...decoded.args, quoteUsdX18: tradeUsd.quoteUsdX18 }),
      ttlSeconds: config.SCOOP_LIVE_TTL_SECONDS,
    });
    if (inserted) {
      const supplyResult = await db.query<{ supply: string | null }>(
        `SELECT COALESCE(
           (SELECT payload->>'totalSupplyRaw'
              FROM live_chain_events
             WHERE chain_id = $1 AND token_address = $2
               AND event_kind = 'TokenLaunched'
             ORDER BY block_number DESC, log_index DESC
             LIMIT 1),
           (SELECT total_supply_raw::text
              FROM tokens
             WHERE chain_id = $1 AND token_address = $2)
         ) AS supply`,
        [config.SCOOP_CHAIN_ID, entry.tokenAddress],
      );
      const totalSupplyRaw = supplyResult.rows[0]?.supply
        ? BigInt(supplyResult.rows[0].supply)
        : null;
      const fdvUsdX18 =
        tradeUsd.executionPriceUsdX18 != null && totalSupplyRaw != null
          ? fdvUsdX18FromPrice({
              priceUsdX18: tradeUsd.executionPriceUsdX18,
              totalSupplyRaw,
              tokenDecimals: entry.tokenDecimals,
            })
          : null;
      await upsertLiveTokenTip(db, {
        chainId: config.SCOOP_CHAIN_ID,
        tokenAddress: entry.tokenAddress,
        poolId,
        quoteAsset: entry.quoteAsset,
        priceQuoteX18: executionPrice,
        priceUsdX18: tradeUsd.executionPriceUsdX18,
        fdvUsdX18,
        volume24hQuoteRaw: amounts.quoteAmountRaw,
        volume24hUsdX18: tradeUsd.usdValueX18,
        tradeCountDelta: 1,
        buyCountDelta: side === 'buy' ? 1 : 0,
        sellCountDelta: side === 'sell' ? 1 : 0,
        lastSide: side,
        lastTradeAt: block.timestamp,
        sourceBlock: log.blockNumber,
        sourceTxHash: txHash,
        sourceLogIndex: decoded.logIndex,
        ttlSeconds: config.SCOOP_LIVE_TTL_SECONDS,
      });
    }
    logJson('info', 'live overlay event observed', {
      eventType: 'Swap',
      chainId: config.SCOOP_CHAIN_ID,
      blockNumber: log.blockNumber.toString(),
      txHash,
      logIndex: decoded.logIndex,
      observedAt: new Date(observedAt).toISOString(),
      blockTimestamp: Number(block.timestamp),
      latencyMs: Math.max(0, observedAt - Number(block.timestamp) * 1000),
      source: 'live',
    });
  }

  return { rpcMs, decodeMs, writeMs: Date.now() - writeStartedAt };
}

/**
 * Best-effort near-tip observer. It owns no canonical state and catches every
 * error so failures can never terminate the fixed-lag indexer.
 */
export async function startLiveTipOverlay({ config, pool, signal }: ObserverArgs): Promise<void> {
  if (!config.SCOOP_LIVE_OVERLAY_ENABLED || signal.aborted) return;
  const rpc = createFailoverRpc({
    primaryUrl: config.ROBINHOOD_RPC_URL!,
    fallbackUrl: config.ROBINHOOD_FALLBACK_RPC_URL,
  });
  let watchlist: Awaited<ReturnType<typeof loadWatchlist>> | null = null;
  let lastCleanupAt = 0;
  let lastHealthyLogAt = 0;

  while (!signal.aborted) {
    const loopStartedAt = Date.now();
    try {
      if (!watchlist) {
        watchlist = await withTransaction(pool, (db) => loadWatchlist(db, config.SCOOP_CHAIN_ID));
      }
      const activeWatchlist = watchlist;
      const latestStartedAt = Date.now();
      const latest = await rpc.withClient((client) => client.getBlockNumber());
      let rpcMs = Date.now() - latestStartedAt;
      let decodeMs = 0;
      let writeMs = 0;
      const checkpoint = await withTransaction(pool, (db) =>
        getLiveObserverCheckpoint(db, config.SCOOP_CHAIN_ID),
      );
      const canonicalCheckpoint =
        checkpoint == null
          ? await withTransaction(pool, (db) =>
              getIndexerMainCheckpointBlock(db, config.SCOOP_CHAIN_ID),
            )
          : null;
      const window = resolveLiveScanWindow({
        latest,
        liveCheckpoint: checkpoint == null ? null : BigInt(checkpoint),
        canonicalCheckpoint:
          canonicalCheckpoint == null ? null : BigInt(canonicalCheckpoint),
        maxCatchupBlocks: config.SCOOP_LIVE_MAX_CATCHUP_BLOCKS,
        replayWindowBlocks: config.SCOOP_LIVE_REPLAY_WINDOW_BLOCKS,
        staleLagBlocks: config.SCOOP_LIVE_STALE_LAG_BLOCKS,
      });
      const { fromBlock, toBlock } = window;
      if (fromBlock <= toBlock) {
        const timings = await withTransaction(pool, async (db) => {
          const result = await observeRange({
            db,
            client: rpc.getClient(),
            config,
            fromBlock,
            toBlock,
            watchlist: activeWatchlist,
          });
          await setLiveObserverCheckpoint(db, config.SCOOP_CHAIN_ID, toBlock);
          return result;
        });
        rpcMs += timings.rpcMs;
        decodeMs = timings.decodeMs;
        writeMs = timings.writeMs;
      }
      if (Date.now() - lastCleanupAt >= 60_000) {
        await withTransaction(pool, (db) => expireLiveOverlayRows(db, config.SCOOP_CHAIN_ID));
        lastCleanupAt = Date.now();
      }

      const checkpointBlock = fromBlock <= toBlock ? toBlock : window.last;
      const remainingLag = latest > checkpointBlock ? latest - checkpointBlock : 0n;
      const healthFields = {
        source: 'live-observer',
        latestBlock: latest.toString(),
        checkpointBlock: checkpointBlock.toString(),
        lagBlocks: remainingLag.toString(),
        scanFrom: fromBlock.toString(),
        scanTo: toBlock.toString(),
        rpcMs,
        decodeMs,
        writeMs,
        loopMs: Date.now() - loopStartedAt,
        jumped: window.jumped,
      };
      if (window.jumped) {
        logJson('warn', 'live overlay near-tip jump', {
          ...healthFields,
          from: fromBlock.toString(),
          to: toBlock.toString(),
          lag: window.lagBlocks.toString(),
          latest: latest.toString(),
        });
      } else if (toBlock < latest) {
        logJson('info', 'live overlay catch-up batch', healthFields);
      } else if (
        remainingLag > BigInt(config.SCOOP_LIVE_STALE_LAG_BLOCKS)
      ) {
        logJson('warn', 'live overlay lag threshold exceeded', healthFields);
      } else if (Date.now() - lastHealthyLogAt >= 30_000) {
        logJson('info', 'live overlay healthy at tip', healthFields);
        lastHealthyLogAt = Date.now();
      }

      // Never throttle catch-up. Poll only after reaching the observed tip.
      if (fromBlock > latest || toBlock >= latest) {
        await wait(config.SCOOP_LIVE_POLL_MS, signal);
      }
    } catch (error) {
      logJson('warn', 'live overlay observer error — retrying', {
        chainId: config.SCOOP_CHAIN_ID,
        error: error instanceof Error ? error.message : String(error),
        source: 'live-observer',
      });
      // Reload after a DB/RPC failure so newly canonical launches are included.
      try {
        watchlist = await withTransaction(pool, (db) => loadWatchlist(db, config.SCOOP_CHAIN_ID));
      } catch {
        // Keep the previous in-memory watchlist.
      }
      await wait(Math.max(config.SCOOP_LIVE_POLL_MS, 2_000), signal);
    }
  }
}
