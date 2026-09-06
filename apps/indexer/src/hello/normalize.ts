import type { Queryable } from '@scoop/db';
import { upsertIndexerCheckpoint, upsertIndexerHealth } from '@scoop/db';
import { HELLO } from './fixture.js';
import type { DecodedHelloEvent } from './decode.js';
import type { HelloTokenMetadata } from './hydrate.js';
import { normalizeLaunch } from '../live/normalizeLaunch.js';
import type { DecodedChainEvent } from '../live/decode.js';

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

/**
 * HELLO normalize — thin wrapper over shared normalizeLaunch + HELLO checkpoint/health.
 */
export async function normalizeHello(db: Queryable, input: HelloNormalizeInput): Promise<void> {
  await normalizeLaunch(db, {
    chainId: input.chainId,
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    blockTimestamp: input.blockTimestamp,
    txHash: input.txHash,
    txIndex: input.txIndex,
    txFrom: input.txFrom,
    logs: input.logs,
    decoded: input.decoded as DecodedChainEvent[],
    tokenMeta: {
      name: input.tokenMeta.name || HELLO.metadata.name,
      symbol: input.tokenMeta.symbol || HELLO.metadata.symbol,
      decimals: input.tokenMeta.decimals || HELLO.tokenDecimals,
      totalSupply: input.tokenMeta.totalSupply || HELLO.totalSupply,
      description: input.tokenMeta.description || HELLO.metadata.description,
      website: input.tokenMeta.website || HELLO.metadata.website,
      logo: input.tokenMeta.logo || HELLO.metadata.imageUri,
      twitter: input.tokenMeta.twitter || HELLO.metadata.twitter,
      telegram: input.tokenMeta.telegram || HELLO.metadata.telegram,
      discord: input.tokenMeta.discord || HELLO.metadata.discord,
      farcaster: input.tokenMeta.farcaster || HELLO.metadata.farcaster,
      deployer: input.tokenMeta.deployer || HELLO.creator,
      launchFactory: input.tokenMeta.launchFactory || HELLO.factory,
    },
    launch: {
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
      launchFeeRaw: HELLO.launchFee,
      initialBuyPresent: true,
      initialBuyQuoteRaw: HELLO.initialBuyQuote,
      initialBuyTokensRaw: HELLO.initialBuyTokens,
      launchLogIndex: HELLO.launchLogIndex,
    },
    protocol: {
      poolManager: HELLO.poolManager,
      positionManager: HELLO.positionManager,
      universalRouter: HELLO.universalRouter,
      poolFee: HELLO.poolFee,
      tickSpacing: HELLO.tickSpacing,
      hooks: HELLO.hooks,
    },
    confirmationStatus: 'confirmed',
  });

  await upsertIndexerCheckpoint(db, {
    chainId: input.chainId,
    streamName: HELLO.streamName,
    lastBlockNumber: input.blockNumber,
    lastBlockHash: input.blockHash.toLowerCase(),
    lastLogIndex: Math.max(...input.logs.map((l) => l.logIndex), -1),
  });

  await upsertIndexerHealth(db, {
    chainId: input.chainId,
    latestIndexedBlock: HELLO.blockNumber,
    lastRpcOkAt: new Date(),
    notes: 'HELLO vertical slice backfill complete — live indexing disabled',
  });
}
