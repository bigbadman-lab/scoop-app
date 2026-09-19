/**
 * Onchain HoodLock locks(id) verification + 6-month policy check.
 */
import type { PublicClient } from 'viem';
import { getAddress } from 'viem';
import { PonsAdapterError } from './errors';
import { hoodlockLockerAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';
import {
  resolveDevSupplyPolicy,
  unlockSatisfiesPolicy,
  type DevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';

export type HoodlockOnchainLock = {
  lockId: bigint;
  owner: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  unlockTime: bigint;
  withdrawn: boolean;
};

export async function readHoodlockLock(args: {
  publicClient: PublicClient;
  lockId: bigint;
  lockerAddress?: `0x${string}`;
}): Promise<HoodlockOnchainLock> {
  const locker = getAddress(
    args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;
  const row = (await args.publicClient.readContract({
    address: locker,
    abi: hoodlockLockerAbi,
    functionName: 'locks',
    args: [args.lockId],
  })) as readonly [string, string, bigint, bigint, boolean];

  return {
    lockId: args.lockId,
    owner: getAddress(row[0]) as `0x${string}`,
    token: getAddress(row[1]) as `0x${string}`,
    amount: row[2],
    unlockTime: row[3],
    withdrawn: row[4],
  };
}

/**
 * Verify locks(id) against expected creator/token/amount and six-month policy
 * relative to the lock block timestamp (not wall clock).
 */
export async function verifyHoodlockOnchainLock(args: {
  publicClient: PublicClient;
  lockId: bigint;
  expectedOwner: `0x${string}`;
  expectedToken: `0x${string}`;
  expectedAmount: bigint;
  /** Block timestamp when the lock was mined. */
  lockBlockTimestampUnix: number;
  lockerAddress?: `0x${string}`;
  /** Defaults to lock_6m so older callers keep the previous policy. */
  policy?: DevSupplyPolicy;
}): Promise<HoodlockOnchainLock> {
  const lock = await readHoodlockLock({
    publicClient: args.publicClient,
    lockId: args.lockId,
    lockerAddress: args.lockerAddress,
  });

  const owner = getAddress(args.expectedOwner).toLowerCase();
  const token = getAddress(args.expectedToken).toLowerCase();

  if (lock.owner.toLowerCase() !== owner) {
    throw new PonsAdapterError(
      'LOCK_VERIFY_FAILED',
      'Onchain lock owner does not match the launch creator.',
    );
  }
  if (lock.token.toLowerCase() !== token) {
    throw new PonsAdapterError(
      'LOCK_VERIFY_FAILED',
      'Onchain lock token does not match the launched token.',
    );
  }
  if (lock.withdrawn) {
    throw new PonsAdapterError(
      'LOCK_VERIFY_FAILED',
      'Onchain lock is already withdrawn.',
    );
  }
  if (lock.amount !== args.expectedAmount) {
    throw new PonsAdapterError(
      'LOCK_VERIFY_FAILED',
      'Onchain lock amount does not match the exact launch allocation.',
    );
  }

  const policy = resolveDevSupplyPolicy(args.policy);
  if (policy === 'burn') {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Burn policy does not use HoodLock.',
    );
  }
  const check = unlockSatisfiesPolicy({
    policy,
    unlockTimeUnix: Number(lock.unlockTime),
    lockTimeReferenceUnix: args.lockBlockTimestampUnix,
  });
  if (!check.ok) {
    throw new PonsAdapterError('LOCK_VERIFY_FAILED', check.message);
  }

  return lock;
}
