/**
 * HoodLock approval + lock orchestrator (Gate 5 / Gate 7).
 * Consumes Gate 4 lock_required state. Wired to public /launch via run-public-pons-launch.
 *
 * Broadcasts are injected so unit tests never hit chain.
 */
import type { PublicClient, TransactionReceipt } from 'viem';
import { getAddress } from 'viem';
import {
  buildExactHoodlockApproval,
  type HoodlockApprovalRequest,
} from '@/lib/launch/adapters/pons/hoodlock-approve';
import {
  assertHoodlockLockNotCommitted,
  findExistingQualifyingHoodlockLock,
} from '@/lib/launch/adapters/pons/hoodlock-duplicate';
import { decodeHoodlockLockedReceipt } from '@/lib/launch/adapters/pons/hoodlock-decode';
import { runHoodlockPreflight } from '@/lib/launch/adapters/pons/hoodlock-preflight';
import { simulateHoodlockLock } from '@/lib/launch/adapters/pons/hoodlock-simulate';
import { verifyHoodlockOnchainLock } from '@/lib/launch/adapters/pons/hoodlock-verify';
import { erc20ApproveAbi } from '@/lib/launch/adapters/pons/hoodlock-abi';
import {
  HOODLOCK_CHAIN_ID,
  HOODLOCK_LOCKER_ADDRESS,
} from '@/lib/launch/adapters/pons/hoodlock-constants';
import type { HoodlockLockRequest } from '@/lib/launch/adapters/pons/hoodlock-build-lock';
import { PonsAdapterError } from '@/lib/launch/adapters/pons/errors';
import {
  bigintToDecimal,
  decimalToBigint,
  type PonsPendingLaunchState,
} from '@/lib/launch/adapters/pons/lifecycle-types';
import {
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from '@/lib/launch/adapters/pons/pending-storage';
import { isLaunchCommitted } from '@/lib/launch/adapters/pons/lifecycle-types';
import { resolveDevSupplyPolicy } from '@/lib/launch/dev-supply-policy';

function now(): number {
  return Date.now();
}

function requireExactDevTokens(state: PonsPendingLaunchState): bigint {
  const amount = decimalToBigint(state.devTokensOut);
  if (amount == null || amount <= BigInt(0)) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Exact Gate 4 devTokensOut required before HoodLock.',
    );
  }
  return amount;
}

function assertLockPolicy(state: PonsPendingLaunchState): void {
  if (resolveDevSupplyPolicy(state.devSupplyPolicy) === 'burn') {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Burn policy does not use HoodLock.',
    );
  }
}

function assertLaunchDone(state: PonsPendingLaunchState): void {
  if (!isLaunchCommitted(state) || !state.tokenAddress || !state.devTokensOut) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Pons launch must be confirmed before HoodLock.',
    );
  }
}

export type HoodlockPrepareResult = {
  state: PonsPendingLaunchState;
  approvalRequired: boolean;
  approvalRequest: HoodlockApprovalRequest | null;
  exactLockAmount: bigint;
  unlockTime: bigint;
  feeWei: bigint;
};

/**
 * Preflight from lock_required → approval_required or lock_ready.
 */
export async function prepareHoodlockLock(args: {
  publicClient: PublicClient;
  draftId: string;
  chainId?: number;
  chainTimestampUnix?: number;
}): Promise<HoodlockPrepareResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertLaunchDone(state);
  assertLockPolicy(state);
  assertHoodlockLockNotCommitted(state);

  // Recover existing onchain lock before approving/locking again.
  const exactLockAmount = requireExactDevTokens(state);
  const token = getAddress(state.tokenAddress!) as `0x${string}`;
  const creator = getAddress(state.creator) as `0x${string}`;
  const ref =
    args.chainTimestampUnix ??
    Number(
      decimalToBigint(state.lockReferenceTimestamp) ??
        (await args.publicClient.getBlock({ blockTag: 'latest' })).timestamp,
    );

  const existing = await findExistingQualifyingHoodlockLock({
    publicClient: args.publicClient,
    owner: creator,
    token,
    expectedAmount: exactLockAmount,
    lockTimeReferenceUnix: ref,
    policy: resolveDevSupplyPolicy(state.devSupplyPolicy),
  });
  if (existing) {
    const block = await args.publicClient.getBlock({ blockTag: 'latest' });
    const next: PonsPendingLaunchState = {
      ...state,
      phase: 'lock_verified',
      hoodlockLockId: bigintToDecimal(existing.lockId),
      hoodlockLockedAmount: bigintToDecimal(existing.amount),
      unlockTime: bigintToDecimal(existing.unlockTime),
      hoodlockVerified: true,
      hoodlockVerificationBlock: bigintToDecimal(block.number),
      lastError: null,
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError(
      'LOCK_ALREADY_EXISTS',
      'A matching HoodLock already exists onchain. Recovered — do not lock again.',
      { cause: { lockId: existing.lockId.toString() } },
    );
  }

  const preflight = await runHoodlockPreflight({
    publicClient: args.publicClient,
    state,
    chainId: args.chainId ?? HOODLOCK_CHAIN_ID,
    chainTimestampUnix: args.chainTimestampUnix,
  });

  let approvalRequest: HoodlockApprovalRequest | null = null;
  if (preflight.approvalRequired) {
    approvalRequest = buildExactHoodlockApproval({
      token,
      creator,
      exactLockAmount: preflight.exactLockAmount,
    });
  }

  return {
    state: preflight.state,
    approvalRequired: preflight.approvalRequired,
    approvalRequest,
    exactLockAmount: preflight.exactLockAmount,
    unlockTime: preflight.unlockTime,
    feeWei: preflight.feeWei,
  };
}

export type HoodlockWriteFn<T> = (request: T) => Promise<`0x${string}`>;

export type HoodlockApprovalBroadcastResult = {
  state: PonsPendingLaunchState;
  approvalTxHash: `0x${string}`;
  receipt: TransactionReceipt;
};

/**
 * Broadcast exact approve. Persist hash IMMEDIATELY before receipt wait.
 */
export async function broadcastHoodlockApproval(args: {
  publicClient: PublicClient;
  draftId: string;
  request: HoodlockApprovalRequest;
  writeContract: HoodlockWriteFn<HoodlockApprovalRequest>;
  waitForReceipt?: (hash: `0x${string}`) => Promise<TransactionReceipt>;
}): Promise<HoodlockApprovalBroadcastResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertLaunchDone(state);
  assertLockPolicy(state);
  assertHoodlockLockNotCommitted(state);

  const exactLockAmount = requireExactDevTokens(state);
  const token = getAddress(state.tokenAddress!) as `0x${string}`;
  const creator = getAddress(state.creator) as `0x${string}`;
  const hoodlock = getAddress(
    state.hoodlockAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;

  // Refuse unlimited / wrong amount in request
  if (args.request.args[1] !== exactLockAmount) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Approval amount must equal exact Gate 4 devTokensOut.',
    );
  }

  const hash = await args.writeContract(args.request);

  let next: PonsPendingLaunchState = {
    ...state,
    phase: 'approval_submitted',
    hoodlockApprovalTxHash: hash,
    lastError: null,
    updatedAt: now(),
  };
  try {
    savePonsPendingLaunch(next);
  } catch (e) {
    throw new PonsAdapterError(
      'PERSISTENCE_FAILED',
      'Approval was submitted but recovery state could not be saved. Do not relaunch.',
      { cause: { hoodlockApprovalTxHash: hash, draftId: args.draftId, e } },
    );
  }

  next = { ...next, phase: 'approval_confirming', updatedAt: now() };
  savePonsPendingLaunch(next);

  const wait =
    args.waitForReceipt ??
    ((h: `0x${string}`) =>
      args.publicClient.waitForTransactionReceipt({ hash: h }));
  const receipt = await wait(hash);

  if (receipt.status === 'reverted') {
    next = {
      ...next,
      phase: 'approval_required',
      lastError: {
        code: 'TX_REVERTED',
        message: 'Approval reverted. Check allowance and retry approval only.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError('TX_REVERTED', next.lastError!.message, {
      cause: { hoodlockApprovalTxHash: hash },
    });
  }

  next = {
    ...next,
    phase: 'approval_confirmed',
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const allowance = (await args.publicClient.readContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [creator, hoodlock],
  })) as bigint;

  if (allowance < exactLockAmount) {
    next = {
      ...next,
      phase: 'recoverable_failure',
      hoodlockAllowanceWei: bigintToDecimal(allowance),
      lastError: {
        code: 'APPROVAL_INSUFFICIENT',
        message:
          'Approval confirmed but allowance is still below the lock amount. Do not relaunch.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError(
      'APPROVAL_INSUFFICIENT',
      next.lastError!.message,
      { cause: { allowance: allowance.toString() } },
    );
  }

  next = {
    ...next,
    phase: 'lock_ready',
    approvalRequired: false,
    hoodlockAllowanceWei: bigintToDecimal(allowance),
    lastError: null,
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  return { state: next, approvalTxHash: hash, receipt };
}

export type HoodlockLockBroadcastResult = {
  state: PonsPendingLaunchState;
  lockTxHash: `0x${string}`;
  receipt: TransactionReceipt;
  lockId: bigint;
};

/**
 * Simulate + broadcast HoodLock.lock.
 * Persist hoodlockLockTxHash IMMEDIATELY before receipt wait.
 * Success requires Locked decode + locks(id) verification.
 */
export async function broadcastHoodlockLock(args: {
  publicClient: PublicClient;
  draftId: string;
  writeContract: HoodlockWriteFn<HoodlockLockRequest>;
  waitForReceipt?: (hash: `0x${string}`) => Promise<TransactionReceipt>;
  /** Optional unlock override (tests). */
  unlockTime?: bigint;
}): Promise<HoodlockLockBroadcastResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertLaunchDone(state);
  assertLockPolicy(state);
  assertHoodlockLockNotCommitted(state);

  const exactLockAmount = requireExactDevTokens(state);
  const token = getAddress(state.tokenAddress!) as `0x${string}`;
  const creator = getAddress(state.creator) as `0x${string}`;

  const unlockTime =
    args.unlockTime ??
    decimalToBigint(state.unlockTime) ??
    null;
  if (unlockTime == null) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Unlock time missing — run HoodLock preflight first.',
    );
  }

  // Fresh fee + simulate (simulation failure must not mutate irreversible state)
  const simulated = await simulateHoodlockLock({
    publicClient: args.publicClient,
    token,
    exactLockAmount,
    unlockTime,
    creator,
  });

  let next: PonsPendingLaunchState = {
    ...state,
    hoodlockFeeWei: bigintToDecimal(simulated.feeWei),
    unlockTime: bigintToDecimal(unlockTime),
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const hash = await args.writeContract(simulated.request);

  next = {
    ...next,
    phase: 'lock_submitted',
    hoodlockLockTxHash: hash,
    lastError: null,
    updatedAt: now(),
  };
  try {
    savePonsPendingLaunch(next);
  } catch (e) {
    throw new PonsAdapterError(
      'PERSISTENCE_FAILED',
      'Lock was submitted but recovery state could not be saved. Do not relaunch or re-lock blindly.',
      { cause: { hoodlockLockTxHash: hash, draftId: args.draftId, e } },
    );
  }

  next = { ...next, phase: 'lock_confirming', updatedAt: now() };
  savePonsPendingLaunch(next);

  const wait =
    args.waitForReceipt ??
    ((h: `0x${string}`) =>
      args.publicClient.waitForTransactionReceipt({ hash: h }));
  const receipt = await wait(hash);

  if (receipt.status === 'reverted') {
    next = {
      ...next,
      phase: 'recoverable_failure',
      lastError: {
        code: 'TX_REVERTED',
        message:
          'HoodLock transaction reverted. Token is live — check for existing locks before retrying.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError('TX_REVERTED', next.lastError!.message, {
      cause: { hoodlockLockTxHash: hash },
    });
  }

  next = {
    ...next,
    phase: 'lock_confirmed',
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const decoded = decodeHoodlockLockedReceipt({
    receipt,
    expectedOwner: creator,
    expectedToken: token,
    expectedAmount: exactLockAmount,
    expectedUnlockTime: unlockTime,
  });

  next = {
    ...next,
    phase: 'lock_verifying',
    hoodlockLockId: bigintToDecimal(decoded.lockId),
    hoodlockLockedAmount: bigintToDecimal(decoded.amount),
    unlockTime: bigintToDecimal(decoded.unlockTime),
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const lockBlock = await args.publicClient.getBlock({
    blockNumber: receipt.blockNumber,
  });

  const verified = await verifyHoodlockOnchainLock({
    publicClient: args.publicClient,
    lockId: decoded.lockId,
    expectedOwner: creator,
    expectedToken: token,
    expectedAmount: exactLockAmount,
    lockBlockTimestampUnix: Number(lockBlock.timestamp),
    policy: resolveDevSupplyPolicy(state.devSupplyPolicy),
  });

  next = {
    ...next,
    phase: 'lock_verified',
    hoodlockLockId: bigintToDecimal(verified.lockId),
    hoodlockLockedAmount: bigintToDecimal(verified.amount),
    unlockTime: bigintToDecimal(verified.unlockTime),
    hoodlockVerified: true,
    hoodlockVerificationBlock: bigintToDecimal(receipt.blockNumber),
    lastError: null,
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  return {
    state: next,
    lockTxHash: hash,
    receipt,
    lockId: verified.lockId,
  };
}
