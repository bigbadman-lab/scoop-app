/**
 * HoodLock approval / lock recovery (Gate 5). Never relaunches Pons.
 */
import type { PublicClient, TransactionReceipt } from 'viem';
import { getAddress } from 'viem';
import { decodeHoodlockLockedReceipt } from './hoodlock-decode';
import { findExistingQualifyingHoodlockLock } from './hoodlock-duplicate';
import { erc20ApproveAbi } from './hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from './hoodlock-constants';
import { verifyHoodlockOnchainLock } from './hoodlock-verify';
import { PonsAdapterError } from './errors';
import { resolveDevSupplyPolicy } from '@/lib/launch/dev-supply-policy';
import {
  bigintToDecimal,
  decimalToBigint,
  type HoodlockRecoveryOutcome,
  type PonsPendingLaunchState,
} from './lifecycle-types';
import {
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from './pending-storage';

export type HoodlockRecoverResult = {
  outcome: HoodlockRecoveryOutcome;
  state: PonsPendingLaunchState;
  receipt: TransactionReceipt | null;
};

function requireExactAmount(state: PonsPendingLaunchState): bigint {
  const amount = decimalToBigint(state.devTokensOut);
  if (amount == null || amount <= BigInt(0)) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Exact devTokensOut missing — cannot recover HoodLock.',
    );
  }
  return amount;
}

async function getReceiptOrNull(
  publicClient: PublicClient,
  hash: `0x${string}`,
): Promise<TransactionReceipt | null> {
  try {
    return await publicClient.getTransactionReceipt({ hash });
  } catch {
    return null;
  }
}

async function markVerified(
  state: PonsPendingLaunchState,
  args: {
    lockId: bigint;
    amount: bigint;
    unlockTime: bigint;
    verificationBlock: bigint;
  },
): Promise<PonsPendingLaunchState> {
  const next: PonsPendingLaunchState = {
    ...state,
    phase: 'lock_verified',
    hoodlockLockId: bigintToDecimal(args.lockId),
    hoodlockLockedAmount: bigintToDecimal(args.amount),
    unlockTime: bigintToDecimal(args.unlockTime),
    hoodlockVerified: true,
    hoodlockVerificationBlock: bigintToDecimal(args.verificationBlock),
    lastError: null,
    updatedAt: Date.now(),
  };
  savePonsPendingLaunch(next);
  return next;
}

/**
 * Recover HoodLock approval/lock from durable pending state.
 * Never broadcasts. Never relaunches.
 */
export async function recoverHoodlockFromPending(args: {
  publicClient: PublicClient;
  draftId: string;
  stateOverride?: PonsPendingLaunchState | null;
}): Promise<HoodlockRecoverResult> {
  const state =
    args.stateOverride ?? loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'No pending Pons launch draft to recover HoodLock from.',
    );
  }

  if (state.hoodlockVerified === true && state.hoodlockLockId) {
    return { outcome: 'LOCK_ALREADY_VERIFIED', state, receipt: null };
  }

  const exactAmount = requireExactAmount(state);
  if (!state.tokenAddress) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Token address missing from draft.',
    );
  }
  const token = getAddress(state.tokenAddress) as `0x${string}`;
  const creator = getAddress(state.creator) as `0x${string}`;
  const hoodlock = getAddress(
    state.hoodlockAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;

  // --- Lock id known: verify directly ---
  if (state.hoodlockLockId) {
    const lockId = decimalToBigint(state.hoodlockLockId)!;
    let lockBlockTs: number;
    const ref = decimalToBigint(state.lockReferenceTimestamp);
    if (ref != null) {
      lockBlockTs = Number(ref);
    } else {
      const block = await args.publicClient.getBlock({ blockTag: 'latest' });
      lockBlockTs = Number(block.timestamp);
    }
    try {
      const lock = await verifyHoodlockOnchainLock({
        publicClient: args.publicClient,
        lockId,
        expectedOwner: creator,
        expectedToken: token,
        expectedAmount: exactAmount,
        lockBlockTimestampUnix: lockBlockTs,
        lockerAddress: hoodlock,
      });
      const block = await args.publicClient.getBlock({ blockTag: 'latest' });
      const next = await markVerified(state, {
        lockId: lock.lockId,
        amount: lock.amount,
        unlockTime: lock.unlockTime,
        verificationBlock: block.number,
      });
      return { outcome: 'LOCK_CONFIRMED_RECOVERED', state: next, receipt: null };
    } catch (e) {
      const failed: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        lastError: {
          code: 'LOCK_VERIFY_FAILED',
          message:
            e instanceof PonsAdapterError
              ? e.message
              : 'Could not verify existing lock id.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(failed);
      return {
        outcome: 'LOCK_RECOVERY_UNRESOLVED',
        state: failed,
        receipt: null,
      };
    }
  }

  // --- Lock tx known ---
  if (state.hoodlockLockTxHash) {
    const hash = state.hoodlockLockTxHash;
    const receipt = await getReceiptOrNull(args.publicClient, hash);
    if (!receipt) {
      const pending: PonsPendingLaunchState = {
        ...state,
        phase: 'lock_confirming',
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(pending);
      return { outcome: 'LOCK_PENDING', state: pending, receipt: null };
    }
    if (receipt.status === 'reverted') {
      const reverted: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        lastError: {
          code: 'TX_REVERTED',
          message:
            'HoodLock transaction reverted. Token is live — resume lock after checking no lock exists.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(reverted);
      return { outcome: 'LOCK_REVERTED', state: reverted, receipt };
    }

    const unlockTime = decimalToBigint(state.unlockTime);
    if (unlockTime == null) {
      const failed: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        lastError: {
          code: 'LOCK_DECODE_FAILED',
          message: 'Lock confirmed but unlockTime missing from draft.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(failed);
      return {
        outcome: 'LOCK_RECOVERY_UNRESOLVED',
        state: failed,
        receipt,
      };
    }

    try {
      const decoded = decodeHoodlockLockedReceipt({
        receipt,
        expectedOwner: creator,
        expectedToken: token,
        expectedAmount: exactAmount,
        expectedUnlockTime: unlockTime,
        lockerAddress: hoodlock,
      });
      const block = await args.publicClient.getBlock({
        blockNumber: receipt.blockNumber,
      });
      const lock = await verifyHoodlockOnchainLock({
        publicClient: args.publicClient,
        lockId: decoded.lockId,
        expectedOwner: creator,
        expectedToken: token,
        expectedAmount: exactAmount,
        lockBlockTimestampUnix: Number(block.timestamp),
        lockerAddress: hoodlock,
        policy: resolveDevSupplyPolicy(state.devSupplyPolicy),
      });
      let next: PonsPendingLaunchState = {
        ...state,
        phase: 'lock_confirmed',
        hoodlockLockId: bigintToDecimal(decoded.lockId),
        hoodlockLockedAmount: bigintToDecimal(decoded.amount),
        unlockTime: bigintToDecimal(decoded.unlockTime),
        updatedAt: Date.now(),
      };
      next = await markVerified(next, {
        lockId: lock.lockId,
        amount: lock.amount,
        unlockTime: lock.unlockTime,
        verificationBlock: receipt.blockNumber,
      });
      return {
        outcome: 'LOCK_CONFIRMED_RECOVERED',
        state: next,
        receipt,
      };
    } catch (e) {
      const failed: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        lastError: {
          code: 'LOCK_DECODE_FAILED',
          message:
            e instanceof PonsAdapterError
              ? e.message
              : 'Lock confirmed but could not be verified.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(failed);
      return {
        outcome: 'LOCK_RECOVERY_UNRESOLVED',
        state: failed,
        receipt,
      };
    }
  }

  // --- Approval tx known ---
  if (state.hoodlockApprovalTxHash) {
    const hash = state.hoodlockApprovalTxHash;
    const receipt = await getReceiptOrNull(args.publicClient, hash);
    if (!receipt) {
      const pending: PonsPendingLaunchState = {
        ...state,
        phase: 'approval_confirming',
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(pending);
      return { outcome: 'APPROVAL_PENDING', state: pending, receipt: null };
    }
    if (receipt.status === 'reverted') {
      const reverted: PonsPendingLaunchState = {
        ...state,
        phase: 'approval_required',
        lastError: {
          code: 'TX_REVERTED',
          message: 'Approval reverted. Check allowance and retry approval only.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(reverted);
      return { outcome: 'APPROVAL_REVERTED', state: reverted, receipt };
    }

    const allowance = (await args.publicClient.readContract({
      address: token,
      abi: erc20ApproveAbi,
      functionName: 'allowance',
      args: [creator, hoodlock],
    })) as bigint;

    if (allowance < exactAmount) {
      const failed: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        hoodlockAllowanceWei: bigintToDecimal(allowance),
        lastError: {
          code: 'APPROVAL_INSUFFICIENT',
          message:
            'Approval confirmed but allowance is still below the lock amount.',
        },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(failed);
      return {
        outcome: 'LOCK_RECOVERY_UNRESOLVED',
        state: failed,
        receipt,
      };
    }

    const next: PonsPendingLaunchState = {
      ...state,
      phase: 'lock_ready',
      approvalRequired: false,
      hoodlockAllowanceWei: bigintToDecimal(allowance),
      lastError: null,
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(next);
    return {
      outcome: 'APPROVAL_CONFIRMED_RECOVERED',
      state: next,
      receipt,
    };
  }

  // --- UI state lost: search matching locks ---
  const ref =
    decimalToBigint(state.lockReferenceTimestamp) ??
    Number((await args.publicClient.getBlock({ blockTag: 'latest' })).timestamp);

  try {
    const existing = await findExistingQualifyingHoodlockLock({
      publicClient: args.publicClient,
      owner: creator,
      token,
      expectedAmount: exactAmount,
      lockTimeReferenceUnix: typeof ref === 'bigint' ? Number(ref) : ref,
      lockerAddress: hoodlock,
    });
    if (existing) {
      const block = await args.publicClient.getBlock({ blockTag: 'latest' });
      const next = await markVerified(state, {
        lockId: existing.lockId,
        amount: existing.amount,
        unlockTime: existing.unlockTime,
        verificationBlock: block.number,
      });
      return {
        outcome: 'LOCK_ALREADY_EXISTS',
        state: next,
        receipt: null,
      };
    }
  } catch (e) {
    if (e instanceof PonsAdapterError && e.code === 'LOCK_ALREADY_EXISTS') {
      const failed: PonsPendingLaunchState = {
        ...state,
        phase: 'recoverable_failure',
        lastError: { code: e.code, message: e.message },
        updatedAt: Date.now(),
      };
      savePonsPendingLaunch(failed);
      return {
        outcome: 'LOCK_ALREADY_EXISTS',
        state: failed,
        receipt: null,
      };
    }
    throw e;
  }

  return { outcome: 'LOCK_RECOVERY_UNRESOLVED', state, receipt: null };
}
