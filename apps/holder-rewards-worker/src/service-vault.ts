/**
 * Process one vault across catch-up rounds and discovered assets.
 */
import type { Queryable } from '@scoop/db';
import {
  getEarliestVaultDepositUnix,
  getWorkerRound,
  listDepositAssetsForVault,
  listTokenTransfersThroughBlock,
  listWorkerEntitlements,
  markWorkerRoundPublished,
  replaceWorkerEntitlements,
  upsertWorkerRoundComputed,
  upsertWorkerRoundStatus,
  type HolderRewardsVaultMarket,
} from '@scoop/db';
import {
  hourEndUnixFromRoundId,
  latestCompletableRoundId,
  roundIdFromUnix,
} from '@scoop/shared';
import { type Address, zeroAddress } from 'viem';
import { readUncommitted as readUncommittedOnChain } from './chain.js';
import type { HolderRewardsClients } from './clients.js';
import {
  assertAssetIdentityPreserved,
  computeHolderRewardRound,
  type ComputeRoundResult,
} from './compute.js';
import type { LoadedHolderRewardsConfig } from './config.js';
import { logJson } from './log.js';
import { publishRoundSafe, simulatePublishOffline } from './publish.js';
import { planPushBatches, pushBatchesSafe } from './push.js';
import { resolveSnapshotBlock } from './snapshot-block.js';

export type VaultServiceStats = {
  roundAssetsConsidered: number;
  snapshotsReady: number;
  roundsComputed: number;
  rootsSimulated: number;
  rootsPublished: number;
  pushBatchesSimulated: number;
  pushBatchesSent: number;
  leavesPaid: number;
  leavesFailed: number;
  roundsSkipped: number;
  errors: number;
  writesAttempted: boolean;
  transactionsSent: number;
};

export type ServiceVaultDeps = {
  readUncommittedAmount?: (
    vault: Address,
    asset: Address,
  ) => Promise<bigint>;
  /** When false, never write worker tables (dry-run production safety). */
  persistComputed?: boolean;
  factoryAddress?: Address | null;
  poolManagerAddress?: Address | null;
};

function emptyStats(): VaultServiceStats {
  return {
    roundAssetsConsidered: 0,
    snapshotsReady: 0,
    roundsComputed: 0,
    rootsSimulated: 0,
    rootsPublished: 0,
    pushBatchesSimulated: 0,
    pushBatchesSent: 0,
    leavesPaid: 0,
    leavesFailed: 0,
    roundsSkipped: 0,
    errors: 0,
    writesAttempted: false,
    transactionsSent: 0,
  };
}

function mergeStats(a: VaultServiceStats, b: VaultServiceStats): VaultServiceStats {
  return {
    roundAssetsConsidered: a.roundAssetsConsidered + b.roundAssetsConsidered,
    snapshotsReady: a.snapshotsReady + b.snapshotsReady,
    roundsComputed: a.roundsComputed + b.roundsComputed,
    rootsSimulated: a.rootsSimulated + b.rootsSimulated,
    rootsPublished: a.rootsPublished + b.rootsPublished,
    pushBatchesSimulated: a.pushBatchesSimulated + b.pushBatchesSimulated,
    pushBatchesSent: a.pushBatchesSent + b.pushBatchesSent,
    leavesPaid: a.leavesPaid + b.leavesPaid,
    leavesFailed: a.leavesFailed + b.leavesFailed,
    roundsSkipped: a.roundsSkipped + b.roundsSkipped,
    errors: a.errors + b.errors,
    writesAttempted: a.writesAttempted || b.writesAttempted,
    transactionsSent: a.transactionsSent + b.transactionsSent,
  };
}

async function discoverAssets(
  db: Queryable,
  market: HolderRewardsVaultMarket,
): Promise<string[]> {
  const deposited = await listDepositAssetsForVault(db, {
    chainId: market.chainId,
    vaultAddress: market.holderRewards,
  });
  const set = new Set(deposited.map((a) => a.toLowerCase()));
  // Always consider native ETH + quote + launch token as possible reward assets.
  set.add(zeroAddress);
  set.add(market.quoteAsset.toLowerCase());
  set.add(market.tokenAddress.toLowerCase());
  return [...set].sort();
}

async function resolveRoundWindow(args: {
  db: Queryable;
  market: HolderRewardsVaultMarket;
  nowUnix: number;
  maxRounds: number;
}): Promise<number[]> {
  const latest = latestCompletableRoundId(args.nowUnix);
  const earliestDeposit = await getEarliestVaultDepositUnix(args.db, {
    chainId: args.market.chainId,
    vaultAddress: args.market.holderRewards,
  });
  let start = earliestDeposit != null ? roundIdFromUnix(earliestDeposit) : latest;
  if (latest - start + 1 > args.maxRounds) {
    start = latest - args.maxRounds + 1;
  }
  if (start < 0) start = 0;
  const rounds: number[] = [];
  for (let r = start; r <= latest; r++) rounds.push(r);
  return rounds;
}

export async function serviceVault(args: {
  db: Queryable;
  clients: HolderRewardsClients | null;
  config: LoadedHolderRewardsConfig;
  market: HolderRewardsVaultMarket;
  runId: string;
  nowUnix: number;
  deps?: ServiceVaultDeps;
}): Promise<VaultServiceStats> {
  const { db, config, market, runId, nowUnix } = args;
  const persist =
    args.deps?.persistComputed ?? config.writeEnabled;
  let stats = emptyStats();

  logJson('info', 'launch_discovered', {
    runId,
    chainId: market.chainId,
    token: market.tokenAddress,
    vault: market.holderRewards,
  });

  const assets = await discoverAssets(db, market);
  const rounds = await resolveRoundWindow({
    db,
    market,
    nowUnix,
    maxRounds: config.maxRoundsPerRun,
  });

  const readUncommittedAmount =
    args.deps?.readUncommittedAmount ??
    (async (vault: Address, asset: Address) => {
      if (!args.clients) return 0n;
      return readUncommittedOnChain(args.clients.publicClient, vault, asset);
    });

  for (const roundId of rounds) {
    for (const asset of assets) {
      stats.roundAssetsConsidered += 1;
      try {
        const one = await serviceRoundAsset({
          db,
          clients: args.clients,
          config,
          market,
          roundId,
          asset: asset as Address,
          runId,
          persist,
          readUncommittedAmount,
          factoryAddress: args.deps?.factoryAddress ?? null,
          poolManagerAddress: args.deps?.poolManagerAddress ?? null,
        });
        stats = mergeStats(stats, one);
      } catch (error) {
        stats.errors += 1;
        logJson('error', 'round_failed', {
          runId,
          vault: market.holderRewards,
          roundId,
          asset,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return stats;
}

async function serviceRoundAsset(args: {
  db: Queryable;
  clients: HolderRewardsClients | null;
  config: LoadedHolderRewardsConfig;
  market: HolderRewardsVaultMarket;
  roundId: number;
  asset: Address;
  runId: string;
  persist: boolean;
  readUncommittedAmount: (vault: Address, asset: Address) => Promise<bigint>;
  factoryAddress: Address | null;
  poolManagerAddress: Address | null;
}): Promise<VaultServiceStats> {
  const stats = emptyStats();
  const { db, config, market, roundId, asset, runId, persist } = args;
  const vault = market.holderRewards as Address;
  const token = market.tokenAddress as Address;
  const hourEnd = hourEndUnixFromRoundId(roundId);

  logJson('info', 'round_candidate', {
    runId,
    vault,
    roundId,
    asset,
    token,
  });

  const existing = await getWorkerRound(db, {
    chainId: market.chainId,
    vaultAddress: vault,
    roundId,
    assetAddress: asset,
  });
  if (
    existing &&
    (existing.status === 'settled' ||
      existing.status === 'skipped_no_reward' ||
      existing.status === 'skipped_no_holders')
  ) {
    stats.roundsSkipped += 1;
    return stats;
  }

  const snapshot = await resolveSnapshotBlock({
    db,
    chainId: market.chainId,
    vaultAddress: vault,
    assetAddress: asset,
    roundId,
    confirmations: config.snapshotConfirmations,
  });

  if (!snapshot.ok) {
    stats.roundsSkipped += 1;
    logJson('warn', 'snapshot_not_ready', {
      runId,
      ...snapshot,
    });
    if (persist) {
      await upsertWorkerRoundStatus(db, {
        chainId: market.chainId,
        vaultAddress: vault,
        tokenAddress: token,
        roundId,
        assetAddress: asset,
        snapshotBlock: snapshot.candidateSnapshotBlock ?? 0,
        hourEndUnix: hourEnd,
        status: 'snapshot_not_ready',
        lastError: snapshot.detail,
      });
    }
    return stats;
  }

  stats.snapshotsReady += 1;
  logJson('info', 'snapshot_selected', {
    runId,
    vault,
    roundId,
    asset,
    snapshotBlock: snapshot.snapshotBlock,
    targetHourEnd: snapshot.targetHourEnd,
    persisted: snapshot.persisted,
  });

  // If already computed/published with root, do not recompute silently.
  if (
    existing?.merkleRoot &&
    (existing.status === 'computed' ||
      existing.status === 'publish_ready' ||
      existing.status === 'published' ||
      existing.status === 'push_in_progress' ||
      existing.status === 'settled')
  ) {
    // Continue to publish/push using stored entitlements if needed.
    const storedLeaves = await listWorkerEntitlements(db, {
      chainId: market.chainId,
      vaultAddress: vault,
      roundId,
      assetAddress: asset,
      unpaidOnly: false,
    });
    if (storedLeaves.length === 0) {
      stats.roundsSkipped += 1;
      return stats;
    }
    return continuePublishPush({
      db,
      clients: args.clients,
      config,
      market,
      roundId,
      asset,
      runId,
      persist,
      merkleRoot: existing.merkleRoot as `0x${string}`,
      rewardAmount: BigInt(existing.rewardAmountRaw),
      leaves: storedLeaves.map((e, i) => ({
        account: e.account as Address,
        balanceRaw: BigInt(e.balanceRaw),
        entitlementRaw: BigInt(e.entitlementRaw),
        leafHash: e.leafHash as `0x${string}`,
        leafIndex: e.leafIndex ?? i,
        proof: e.proof as `0x${string}`[],
      })),
      stats,
    });
  }

  const transfers = await listTokenTransfersThroughBlock(db, {
    chainId: market.chainId,
    tokenAddress: token,
    snapshotBlock: snapshot.snapshotBlock,
  });

  logJson('info', 'snapshot_reconstructed', {
    runId,
    vault,
    roundId,
    asset,
    snapshotBlock: snapshot.snapshotBlock,
    transferCount: transfers.length,
  });

  const rewardAmount = await args.readUncommittedAmount(vault, asset);
  assertAssetIdentityPreserved(asset, asset);

  const computed: ComputeRoundResult = computeHolderRewardRound({
    chainId: market.chainId,
    vault,
    token,
    asset,
    roundId,
    snapshotBlock: snapshot.snapshotBlock,
    hourEndUnix: hourEnd,
    rewardAmount,
    transfers,
    feeDistributor: market.feeDistributor as Address,
    liquidityLocker: market.liquidityLocker as Address,
    factory: args.factoryAddress,
    poolManager: args.poolManagerAddress,
  });

  if (!computed.ok) {
    stats.roundsSkipped += 1;
    logJson('info', 'round_complete', {
      runId,
      vault,
      roundId,
      asset,
      status: computed.status,
      reason: computed.reason,
    });
    if (persist) {
      await upsertWorkerRoundStatus(db, {
        chainId: market.chainId,
        vaultAddress: vault,
        tokenAddress: token,
        roundId,
        assetAddress: asset,
        snapshotBlock: snapshot.snapshotBlock,
        hourEndUnix: hourEnd,
        rewardAmountRaw: rewardAmount,
        status: computed.status,
        lastError: computed.reason,
      });
    }
    return stats;
  }

  stats.roundsComputed += 1;
  logJson('info', 'entitlements_computed', {
    runId,
    vault,
    roundId,
    asset,
    eligibleHolderCount: computed.leafCount,
    eligibleSupplyRaw: computed.eligibleSupply.toString(),
    rewardAmountRaw: computed.rewardAmount.toString(),
    excludedCount: computed.excluded.length,
  });
  logJson('info', 'merkle_built', {
    runId,
    vault,
    roundId,
    asset,
    merkleRoot: computed.merkleRoot,
    leafCount: computed.leafCount,
  });

  if (existing?.merkleRoot && existing.merkleRoot !== computed.merkleRoot) {
    throw new Error(
      `FATAL integrity: recomputed root differs for vault=${vault} round=${roundId} asset=${asset}`,
    );
  }

  if (persist) {
    await upsertWorkerRoundComputed(db, {
      chainId: market.chainId,
      vaultAddress: vault,
      tokenAddress: token,
      roundId,
      assetAddress: asset,
      snapshotBlock: snapshot.snapshotBlock,
      hourEndUnix: hourEnd,
      merkleRoot: computed.merkleRoot,
      rewardAmountRaw: computed.rewardAmount,
      eligibleSupplyRaw: computed.eligibleSupply,
      leafCount: computed.leafCount,
      status: 'publish_ready',
    });
    await replaceWorkerEntitlements(db, {
      chainId: market.chainId,
      vaultAddress: vault,
      roundId,
      assetAddress: asset,
      snapshotBlock: snapshot.snapshotBlock,
      eligibleSupplyRaw: computed.eligibleSupply,
      rewardAmountRaw: computed.rewardAmount,
      entitlements: computed.leaves.map((leaf) => ({
        account: leaf.account,
        balanceRaw: leaf.balanceRaw,
        entitlementRaw: leaf.entitlementRaw,
        leafHash: leaf.leafHash,
        leafIndex: leaf.leafIndex,
        proof: leaf.proof,
      })),
    });
  }

  return continuePublishPush({
    db,
    clients: args.clients,
    config,
    market,
    roundId,
    asset,
    runId,
    persist,
    merkleRoot: computed.merkleRoot,
    rewardAmount: computed.rewardAmount,
    leaves: computed.leaves,
    stats,
  });
}

async function continuePublishPush(args: {
  db: Queryable;
  clients: HolderRewardsClients | null;
  config: LoadedHolderRewardsConfig;
  market: HolderRewardsVaultMarket;
  roundId: number;
  asset: Address;
  runId: string;
  persist: boolean;
  merkleRoot: `0x${string}`;
  rewardAmount: bigint;
  leaves: Array<{
    account: Address;
    balanceRaw: bigint;
    entitlementRaw: bigint;
    leafHash: `0x${string}`;
    leafIndex: number;
    proof: `0x${string}`[];
  }>;
  stats: VaultServiceStats;
}): Promise<VaultServiceStats> {
  const { config, market, roundId, asset, runId, persist, stats } = args;
  const vault = market.holderRewards as Address;
  const db = args.db;

  let publishResult;
  if (args.clients) {
    publishResult = await publishRoundSafe({
      clients: args.clients,
      writeEnabled: config.writeEnabled,
      vault,
      roundId,
      asset,
      merkleRoot: args.merkleRoot,
      totalCommitted: args.rewardAmount,
      expectedPublisher: config.expectedPublisherAddress,
      runId,
    });
  } else {
    publishResult = simulatePublishOffline({
      merkleRoot: args.merkleRoot,
      totalCommitted: args.rewardAmount,
    });
    logJson('info', 'publish_simulated', {
      runId,
      vault,
      roundId,
      asset,
      merkleRoot: args.merkleRoot,
      rewardAmountRaw: args.rewardAmount.toString(),
      note: 'offline fixture',
    });
  }

  if (!publishResult.ok) {
    stats.errors += 1;
    if (publishResult.fatal) throw new Error(publishResult.error);
    logJson('error', 'round_failed', {
      runId,
      vault,
      roundId,
      asset,
      error: publishResult.error,
    });
    return stats;
  }

  if (publishResult.mode === 'simulated') {
    stats.rootsSimulated += 1;
  } else {
    stats.rootsPublished += 1;
    if (publishResult.txHash) {
      stats.writesAttempted = true;
      stats.transactionsSent += 1;
      if (persist) {
        await markWorkerRoundPublished(db, {
          chainId: market.chainId,
          vaultAddress: vault,
          roundId,
          assetAddress: asset,
          txHash: publishResult.txHash,
        });
      }
    }
  }

  let pushResult;
  if (args.clients) {
    pushResult = await pushBatchesSafe({
      clients: args.clients,
      writeEnabled: config.writeEnabled,
      vault,
      roundId,
      asset,
      leaves: args.leaves,
      batchSize: config.pushBatchSize,
      runId,
      skipIfPaidOnChain: config.writeEnabled,
    });
  } else {
    const planned = planPushBatches(args.leaves, config.pushBatchSize);
    logJson('info', 'push_batch_simulated', {
      runId,
      vault,
      roundId,
      asset,
      batches: planned.length,
      note: 'offline fixture',
    });
    pushResult = {
      ok: true as const,
      mode: 'simulated' as const,
      batches: planned.length,
      leavesAttempted: args.leaves.length,
      leavesPaid: args.leaves.length,
      leavesFailed: 0,
      txHashes: [],
    };
  }

  if (!pushResult.ok) {
    stats.errors += 1;
    logJson('error', 'round_failed', {
      runId,
      vault,
      roundId,
      asset,
      error: pushResult.error,
    });
    return stats;
  }

  if (pushResult.mode === 'simulated') {
    stats.pushBatchesSimulated += pushResult.batches;
  } else {
    stats.pushBatchesSent += pushResult.batches;
    stats.writesAttempted =
      stats.writesAttempted || pushResult.txHashes.length > 0;
    stats.transactionsSent += pushResult.txHashes.length;
  }
  stats.leavesPaid += pushResult.leavesPaid;
  stats.leavesFailed += pushResult.leavesFailed;

  logJson('info', 'round_complete', {
    runId,
    vault,
    roundId,
    asset,
    merkleRoot: args.merkleRoot,
    leafCount: args.leaves.length,
    publishMode: publishResult.mode,
    pushMode: pushResult.mode,
  });

  return stats;
}
