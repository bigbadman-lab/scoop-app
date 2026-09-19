/**
 * Decode HoodLock Locked event from a confirmed receipt.
 */
import {
  decodeEventLog,
  getAddress,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { PonsAdapterError } from './errors';
import { hoodlockLockerAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';

export type HoodlockLockedDecoded = {
  lockId: bigint;
  owner: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  unlockTime: bigint;
};

function tryDecodeLocked(
  log: Log,
  locker: `0x${string}`,
): HoodlockLockedDecoded | null {
  if (log.address.toLowerCase() !== locker.toLowerCase()) return null;
  try {
    const decoded = decodeEventLog({
      abi: hoodlockLockerAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'Locked') return null;
    const a = decoded.args;
    return {
      lockId: a.id as bigint,
      owner: getAddress(a.owner as string) as `0x${string}`,
      token: getAddress(a.token as string) as `0x${string}`,
      amount: a.amount as bigint,
      unlockTime: a.unlockTime as bigint,
    };
  } catch {
    return null;
  }
}

/**
 * Require exactly one Locked event matching creator/token/amount/unlockTime.
 */
export function decodeHoodlockLockedReceipt(args: {
  receipt: TransactionReceipt;
  expectedOwner: `0x${string}`;
  expectedToken: `0x${string}`;
  expectedAmount: bigint;
  expectedUnlockTime: bigint;
  lockerAddress?: `0x${string}`;
}): HoodlockLockedDecoded {
  const locker = getAddress(
    args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;
  const owner = getAddress(args.expectedOwner).toLowerCase();
  const token = getAddress(args.expectedToken).toLowerCase();

  const matches: HoodlockLockedDecoded[] = [];
  for (const log of args.receipt.logs) {
    const decoded = tryDecodeLocked(log, locker);
    if (!decoded) continue;
    if (decoded.owner.toLowerCase() !== owner) continue;
    if (decoded.token.toLowerCase() !== token) continue;
    if (decoded.amount !== args.expectedAmount) continue;
    if (decoded.unlockTime !== args.expectedUnlockTime) continue;
    matches.push(decoded);
  }

  if (matches.length === 0) {
    throw new PonsAdapterError(
      'LOCK_DECODE_FAILED',
      'Lock receipt confirmed but no matching Locked event was found.',
    );
  }
  if (matches.length > 1) {
    throw new PonsAdapterError(
      'LOCK_DECODE_FAILED',
      'Ambiguous Locked events in receipt — fail closed.',
    );
  }
  return matches[0]!;
}
