/**
 * Duplicate-lock prevention + matching lock search (Gate 5).
 */
import type { PublicClient } from 'viem';
import { getAddress } from 'viem';
import { verifySixMonthUnlock } from '@scoop/shared';
import { PonsAdapterError } from './errors';
import { hoodlockLockerAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';
import {
  isLockCommitted,
  type PonsPendingLaunchState,
} from './lifecycle-types';
import type { HoodlockOnchainLock } from './hoodlock-verify';
import { readHoodlockLock } from './hoodlock-verify';

/**
 * Block blind second lock when local evidence already commits a lock.
 */
export function assertHoodlockLockNotCommitted(
  state: Pick<
    PonsPendingLaunchState,
    'hoodlockLockTxHash' | 'hoodlockLockId' | 'hoodlockVerified' | 'draftId'
  >,
): void {
  if (!isLockCommitted(state)) return;
  throw new PonsAdapterError(
    'LOCK_ALREADY_EXISTS',
    'A HoodLock tx or lock id is already recorded for this draft. Do not lock again.',
    {
      cause: {
        code: 'LOCK_DUPLICATE_BLOCKED',
        draftId: state.draftId,
        hoodlockLockTxHash: state.hoodlockLockTxHash,
        hoodlockLockId: state.hoodlockLockId,
        hoodlockVerified: state.hoodlockVerified,
      },
    },
  );
}

export async function loadMatchingHoodlockLocks(args: {
  publicClient: PublicClient;
  owner: `0x${string}`;
  token: `0x${string}`;
  expectedAmount: bigint;
  /** Reference for six-month minimum (e.g. launch/lock block time). */
  lockTimeReferenceUnix: number;
  lockerAddress?: `0x${string}`;
}): Promise<HoodlockOnchainLock[]> {
  const locker = getAddress(
    args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;
  const owner = getAddress(args.owner) as `0x${string}`;
  const token = getAddress(args.token) as `0x${string}`;

  const byOwner = (await args.publicClient.readContract({
    address: locker,
    abi: hoodlockLockerAbi,
    functionName: 'locksByOwner',
    args: [owner],
  })) as readonly bigint[];

  const byToken = (await args.publicClient.readContract({
    address: locker,
    abi: hoodlockLockerAbi,
    functionName: 'locksByToken',
    args: [token],
  })) as readonly bigint[];

  const tokenSet = new Set(byToken.map((id) => id.toString()));
  const ids = byOwner.filter((id) => tokenSet.has(id.toString()));

  const matches: HoodlockOnchainLock[] = [];
  for (const id of ids) {
    const lock = await readHoodlockLock({
      publicClient: args.publicClient,
      lockId: id,
      lockerAddress: locker,
    });
    if (lock.withdrawn) continue;
    if (lock.owner.toLowerCase() !== owner.toLowerCase()) continue;
    if (lock.token.toLowerCase() !== token.toLowerCase()) continue;
    if (lock.amount !== args.expectedAmount) continue;
    const policy = verifySixMonthUnlock({
      unlockTimeUnix: Number(lock.unlockTime),
      lockTimeReferenceUnix: args.lockTimeReferenceUnix,
    });
    if (!policy.ok) continue;
    matches.push(lock);
  }
  return matches;
}

/**
 * If a qualifying onchain lock already exists, return it (fail closed if ambiguous).
 */
export async function findExistingQualifyingHoodlockLock(args: {
  publicClient: PublicClient;
  owner: `0x${string}`;
  token: `0x${string}`;
  expectedAmount: bigint;
  lockTimeReferenceUnix: number;
  lockerAddress?: `0x${string}`;
}): Promise<HoodlockOnchainLock | null> {
  const matches = await loadMatchingHoodlockLocks(args);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new PonsAdapterError(
      'LOCK_ALREADY_EXISTS',
      'Multiple matching HoodLock records exist — operator review required.',
    );
  }
  return matches[0]!;
}
