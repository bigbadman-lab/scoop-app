/**
 * HoodLock.lock tx builder — fresh fee() required at call site.
 */
import { getAddress } from 'viem';
import { PonsAdapterError } from './errors';
import { hoodlockLockerAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';

export type HoodlockLockRequest = {
  address: `0x${string}`;
  abi: typeof hoodlockLockerAbi;
  functionName: 'lock';
  args: readonly [`0x${string}`, bigint, bigint];
  value: bigint;
  account: `0x${string}`;
};

export function buildHoodlockLockRequest(args: {
  token: `0x${string}`;
  exactLockAmount: bigint;
  unlockTime: bigint;
  feeWei: bigint;
  creator: `0x${string}`;
  lockerAddress?: `0x${string}`;
}): HoodlockLockRequest {
  if (args.exactLockAmount <= BigInt(0)) {
    throw new PonsAdapterError('INVALID_INPUT', 'Lock amount must be > 0.');
  }
  if (args.unlockTime <= BigInt(0)) {
    throw new PonsAdapterError('INVALID_INPUT', 'unlockTime must be > 0.');
  }
  if (args.feeWei < BigInt(0)) {
    throw new PonsAdapterError('INVALID_INPUT', 'HoodLock fee must be >= 0.');
  }

  const locker = getAddress(
    args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;
  const token = getAddress(args.token) as `0x${string}`;
  const creator = getAddress(args.creator) as `0x${string}`;

  return {
    address: locker,
    abi: hoodlockLockerAbi,
    functionName: 'lock',
    args: [token, args.exactLockAmount, args.unlockTime] as const,
    value: args.feeWei,
    account: creator,
  };
}
