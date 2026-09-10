import type { Queryable } from '@scoop/db';
import {
  upsertFeeDistribution,
  upsertCreatorCredit,
  upsertCreatorClaim,
  upsertCreatorClaimable,
} from '@scoop/db';
import { normalizeAddress, normalizeBytes32, ZERO_ADDRESS } from '@scoop/shared';
import type { DecodedChainEvent } from '../decode.js';
import type { Watchlist } from '../watchlist.js';
import { normalizeFeeDistributionArgs } from './feeDistribution.js';

export async function processCreatorEvents(
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
  const { chainId, blockNumber, blockHash, blockTimestamp, txHash, events, watchlist } = args;

  for (const ev of events) {
    if (ev.kind === 'ETHDistributed' || ev.kind === 'TokenDistributed') {
      const entry = watchlist.distributors.get(normalizeAddress(ev.address));
      if (!entry) continue;
      const assetAddress =
        ev.kind === 'TokenDistributed'
          ? normalizeAddress(String(ev.args.token))
          : ZERO_ADDRESS;
      const legs = normalizeFeeDistributionArgs(ev.args);
      await upsertFeeDistribution(db, {
        chainId,
        feeDistributorAddress: ev.address,
        scoopTokenAddress: entry.tokenAddress,
        assetKind: ev.kind === 'ETHDistributed' ? 'eth' : 'token',
        assetAddress,
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
        totalRaw: legs.totalRaw,
        creatorRaw: legs.creatorRaw,
        deployerRaw: legs.deployerRaw,
        buybackRaw: legs.buybackRaw,
        operationsRaw: legs.operationsRaw,
        baseCreatorRaw: legs.baseCreatorRaw,
        baseHoldersRaw: legs.baseHoldersRaw,
        baseDeployerRaw: legs.baseDeployerRaw,
        baseProtocolRaw: legs.baseProtocolRaw,
        baseOperationsRaw: legs.baseOperationsRaw,
        extraCreatorRaw: legs.extraCreatorRaw,
        extraDeployerRaw: legs.extraDeployerRaw,
        extraHoldersRaw: legs.extraHoldersRaw,
        holdersRaw: legs.holdersRaw,
      });
      continue;
    }

    if (ev.kind === 'ETHCredited' || ev.kind === 'TokenCredited') {
      const creatorId = normalizeBytes32(String(ev.args.creatorId));
      const source = normalizeAddress(String(ev.args.source));
      const assetAddress =
        ev.kind === 'TokenCredited'
          ? normalizeAddress(String(ev.args.token))
          : ZERO_ADDRESS;
      const amount = BigInt(String(ev.args.amount));
      await upsertCreatorCredit(db, {
        chainId,
        creatorId,
        sourceAddress: source,
        assetKind: ev.kind === 'ETHCredited' ? 'eth' : 'token',
        assetAddress,
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
        amountRaw: amount,
      });
      await bumpClaimable(db, {
        chainId,
        creatorId,
        assetKind: ev.kind === 'ETHCredited' ? 'eth' : 'token',
        assetAddress,
        delta: amount,
        sourceBlock: blockNumber,
      });
      continue;
    }

    if (ev.kind === 'ETHClaimed' || ev.kind === 'TokenClaimed') {
      const creatorId = normalizeBytes32(String(ev.args.creatorId));
      const assetAddress =
        ev.kind === 'TokenClaimed'
          ? normalizeAddress(String(ev.args.token))
          : ZERO_ADDRESS;
      const amount = BigInt(String(ev.args.amount));
      await upsertCreatorClaim(db, {
        chainId,
        creatorId,
        payoutWallet: normalizeAddress(String(ev.args.wallet)),
        assetKind: ev.kind === 'ETHClaimed' ? 'eth' : 'token',
        assetAddress,
        txHash,
        logIndex: ev.logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
        amountRaw: amount,
      });
      await bumpClaimable(db, {
        chainId,
        creatorId,
        assetKind: ev.kind === 'ETHClaimed' ? 'eth' : 'token',
        assetAddress,
        delta: -amount,
        sourceBlock: blockNumber,
      });
    }
  }
}

async function bumpClaimable(
  db: Queryable,
  args: {
    chainId: number;
    creatorId: string;
    assetKind: string;
    assetAddress: string;
    delta: bigint;
    sourceBlock: bigint;
  },
): Promise<void> {
  const existing = await db.query<{ claimable_raw: string }>(
    `SELECT claimable_raw FROM creator_claimable_state
     WHERE chain_id = $1 AND creator_id = $2 AND asset_kind = $3 AND asset_address = $4`,
    [args.chainId, args.creatorId, args.assetKind, args.assetAddress],
  );
  const prev = existing.rows[0] ? BigInt(existing.rows[0].claimable_raw) : 0n;
  const next = prev + args.delta;
  await upsertCreatorClaimable(db, {
    chainId: args.chainId,
    creatorId: args.creatorId,
    assetKind: args.assetKind,
    assetAddress: args.assetAddress,
    claimableRaw: next < 0n ? 0n : next,
    sourceBlock: args.sourceBlock,
  });
}

/** Map fee-distributor source address → launch token via watchlist. */
export function mapCreditSourceToToken(
  watchlist: Watchlist,
  sourceAddress: string,
): string | null {
  return watchlist.distributors.get(normalizeAddress(sourceAddress))?.tokenAddress ?? null;
}
