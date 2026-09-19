/**
 * Simulate HoodLock.lock before wallet write.
 */
import type { PublicClient } from 'viem';
import { PonsAdapterError } from './errors';
import {
  buildHoodlockLockRequest,
  type HoodlockLockRequest,
} from './hoodlock-build-lock';
import { hoodlockLockerAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';

export type HoodlockSimulateResult = {
  request: HoodlockLockRequest;
  simulatedLockId: bigint | null;
  feeWei: bigint;
};

/** Re-read live fee and simulate lock. Does not mutate durable state. */
export async function simulateHoodlockLock(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  exactLockAmount: bigint;
  unlockTime: bigint;
  creator: `0x${string}`;
  lockerAddress?: `0x${string}`;
}): Promise<HoodlockSimulateResult> {
  const locker = (args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS) as `0x${string}`;

  let feeWei: bigint;
  try {
    feeWei = (await args.publicClient.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'fee',
    })) as bigint;
  } catch (e) {
    throw new PonsAdapterError(
      'LOCK_SIMULATION_FAILED',
      'Could not read live HoodLock fee.',
      { cause: e },
    );
  }

  const request = buildHoodlockLockRequest({
    token: args.token,
    exactLockAmount: args.exactLockAmount,
    unlockTime: args.unlockTime,
    feeWei,
    creator: args.creator,
    lockerAddress: locker,
  });

  try {
    const sim = await args.publicClient.simulateContract({
      address: request.address,
      abi: request.abi,
      functionName: request.functionName,
      args: [...request.args],
      value: request.value,
      account: request.account,
    });
    const simulatedLockId =
      typeof sim.result === 'bigint' ? sim.result : null;
    return { request, simulatedLockId, feeWei };
  } catch (e) {
    throw new PonsAdapterError(
      'LOCK_SIMULATION_FAILED',
      'HoodLock lock simulation failed. Token is already live — resume lock later.',
      { cause: e },
    );
  }
}
