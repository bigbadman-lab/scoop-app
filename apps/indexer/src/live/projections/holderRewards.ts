import type { Queryable } from '@scoop/db';
import {
  upsertHolderRewardDeposit,
  upsertHolderRewardRound,
  upsertHolderRewardPayout,
  upsertAddressClassification,
} from '@scoop/db';
import { normalizeAddress, normalizeBytes32, ZERO_ADDRESS } from '@scoop/shared';
import type { DecodedChainEvent } from '../decode.js';
import type { Watchlist } from '../watchlist.js';

function bytesReason(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (raw === '0x' || raw === '') return null;
  return raw;
}

/**
 * Project HolderRewards vault events discovered via watchlist vault addresses.
 * Does not invent CREATE2 vaults — only processes events from known vaults.
 */
export async function processHolderRewardEvents(
  db: Queryable,
  args: {
    chainId: number;
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: bigint;
    txHash: string;
    events: DecodedChainEvent[];
    watchlist: Watchlist;
  },
): Promise<void> {
  const { chainId, blockNumber, blockHash, blockTimestamp, txHash, events, watchlist } =
    args;

  for (const ev of events) {
    const vault = normalizeAddress(ev.address);
    const entry = watchlist.holderVaults?.get(vault);
    if (!entry) continue;

    if (ev.kind === 'HolderRewardDeposited') {
      await upsertHolderRewardDeposit(db, {
        chainId,
        vaultAddress: vault,
        tokenAddress: entry.tokenAddress,
        feeDistributorAddress: entry.feeDistributorAddress,
        assetAddress: normalizeAddress(String(ev.args.asset)),
        amountRaw: BigInt(String(ev.args.amount)),
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
      });
      continue;
    }

    if (ev.kind === 'HolderRewardRoundPublished') {
      await upsertHolderRewardRound(db, {
        chainId,
        vaultAddress: vault,
        roundId: BigInt(String(ev.args.roundId)),
        assetAddress: normalizeAddress(String(ev.args.asset)),
        merkleRoot: normalizeBytes32(String(ev.args.merkleRoot)),
        totalCommittedRaw: BigInt(String(ev.args.totalCommitted)),
        publishedTxHash: txHash,
        publishedBlockNumber: blockNumber,
        publishedLogIndex: ev.logIndex,
        publishedAt: blockTimestamp,
      });
      continue;
    }

    if (ev.kind === 'HolderRewardPushed') {
      await upsertHolderRewardPayout(db, {
        chainId,
        vaultAddress: vault,
        roundId: BigInt(String(ev.args.roundId)),
        assetAddress: normalizeAddress(String(ev.args.asset)),
        accountAddress: normalizeAddress(String(ev.args.account)),
        amountRaw: BigInt(String(ev.args.amount)),
        payoutType: 'push',
        status: 'paid',
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
      });
      continue;
    }

    if (ev.kind === 'HolderRewardClaimed') {
      await upsertHolderRewardPayout(db, {
        chainId,
        vaultAddress: vault,
        roundId: BigInt(String(ev.args.roundId)),
        assetAddress: normalizeAddress(String(ev.args.asset)),
        accountAddress: normalizeAddress(String(ev.args.account)),
        amountRaw: BigInt(String(ev.args.amount)),
        payoutType: 'claim',
        status: 'paid',
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
      });
      continue;
    }

    if (ev.kind === 'HolderRewardPushFailed') {
      await upsertHolderRewardPayout(db, {
        chainId,
        vaultAddress: vault,
        roundId: BigInt(String(ev.args.roundId)),
        assetAddress: normalizeAddress(String(ev.args.asset)),
        accountAddress: normalizeAddress(String(ev.args.account)),
        amountRaw: BigInt(String(ev.args.amount)),
        payoutType: 'push',
        status: 'failed',
        failureReason: bytesReason(ev.args.reason),
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
      });
      continue;
    }

    if (ev.kind === 'FeeDistributorInitialized') {
      // Integrity only — vault already classified at launch; reinforce linkage.
      await upsertAddressClassification(db, {
        chainId,
        address: vault,
        class: 'holder_rewards',
        label: 'HolderRewards',
        relatedToken: entry.tokenAddress,
        relatedPool: entry.poolId,
        activeFromBlock: blockNumber,
        metadata: {
          feeDistributor: normalizeAddress(
            String(ev.args.feeDistributor_ ?? ev.args.feeDistributor ?? ZERO_ADDRESS),
          ),
        },
      });
    }
  }
}
