import type { PublicClient, TransactionReceipt } from 'viem';
import { decodePonsLaunchAndBuyReceipt } from './decode-receipt';
import { PonsAdapterError } from './errors';
import {
  bigintToDecimal,
  type PonsLaunchPhase,
  type PonsPendingLaunchState,
  type PonsRecoveryOutcome,
} from './lifecycle-types';
import {
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from './pending-storage';

const HOODLOCK_ACTIVE_PHASES = new Set<PonsLaunchPhase>([
  'lock_preflight',
  'approval_required',
  'approval_submitted',
  'approval_confirming',
  'approval_confirmed',
  'lock_ready',
  'lock_submitted',
  'lock_confirming',
  'lock_confirmed',
  'lock_verifying',
  'lock_verified',
]);

function isHoodlockInProgress(state: PonsPendingLaunchState): boolean {
  if (HOODLOCK_ACTIVE_PHASES.has(state.phase)) return true;
  return Boolean(
    state.hoodlockApprovalTxHash ||
      state.hoodlockLockTxHash ||
      state.hoodlockLockId ||
      state.hoodlockVerified === true,
  );
}

export type PonsRecoverResult = {
  outcome: PonsRecoveryOutcome;
  state: PonsPendingLaunchState;
  receipt: TransactionReceipt | null;
};

/**
 * Recover from durable pending state (tx hash and/or resolved token).
 * Never rebroadcasts. Never clobbers an in-progress HoodLock flow.
 */
export async function recoverPonsLaunchFromPending(args: {
  publicClient: PublicClient;
  draftId: string;
  /** Optional in-memory override (e.g. after persistence failure). */
  stateOverride?: PonsPendingLaunchState | null;
}): Promise<PonsRecoverResult> {
  const state =
    args.stateOverride ?? loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'No pending Pons launch draft to recover.',
    );
  }

  // HoodLock in progress / done — do not reset to lock_required via launch recovery.
  if (isHoodlockInProgress(state)) {
    return { outcome: 'ALREADY_LOCK_REQUIRED', state, receipt: null };
  }

  // Already past launch — Gate 5 handoff.
  if (
    state.tokenAddress &&
    state.curveAddress &&
    state.devTokensOut &&
    (state.phase === 'lock_required' ||
      state.phase === 'dev_allocation_resolved' ||
      state.phase === 'token_resolved')
  ) {
    const next: PonsPendingLaunchState = {
      ...state,
      phase: 'lock_required',
      lastError: null,
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(next);
    return { outcome: 'ALREADY_LOCK_REQUIRED', state: next, receipt: null };
  }

  if (!state.ponsTxHash) {
    return { outcome: 'NOTHING_TO_RECOVER', state, receipt: null };
  }

  const hash = state.ponsTxHash;
  let receipt: TransactionReceipt | null = null;
  try {
    receipt = await args.publicClient.getTransactionReceipt({ hash });
  } catch {
    const pending: PonsPendingLaunchState = {
      ...state,
      phase: 'launch_confirming',
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(pending);
    return { outcome: 'TX_PENDING', state: pending, receipt: null };
  }

  if (!receipt) {
    const pending: PonsPendingLaunchState = {
      ...state,
      phase: 'launch_confirming',
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(pending);
    return { outcome: 'TX_PENDING', state: pending, receipt: null };
  }

  if (receipt.status === 'reverted') {
    const reverted: PonsPendingLaunchState = {
      ...state,
      phase: 'recoverable_failure',
      receiptBlockNumber: bigintToDecimal(receipt.blockNumber),
      lastError: {
        code: 'TX_REVERTED',
        message:
          'Launch transaction reverted onchain. Do not relaunch without operator review.',
      },
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(reverted);
    return { outcome: 'TX_REVERTED', state: reverted, receipt };
  }

  try {
    const decoded = decodePonsLaunchAndBuyReceipt({
      receipt,
      expectedCreator: state.creator,
    });
    const recovered: PonsPendingLaunchState = {
      ...state,
      phase: 'lock_required',
      tokenAddress: decoded.tokenAddress,
      curveAddress: decoded.curveAddress,
      devTokensOut: bigintToDecimal(decoded.actualTokensOut),
      actualQuoteIn: bigintToDecimal(decoded.actualQuoteIn),
      refundWei: bigintToDecimal(decoded.refundWei),
      receiptBlockNumber: bigintToDecimal(receipt.blockNumber),
      lastError: null,
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(recovered);
    return { outcome: 'TX_CONFIRMED_RECOVERED', state: recovered, receipt };
  } catch (e) {
    const failed: PonsPendingLaunchState = {
      ...state,
      phase: 'recoverable_failure',
      receiptBlockNumber: bigintToDecimal(receipt.blockNumber),
      lastError: {
        code: 'RECEIPT_DECODE_FAILED',
        message:
          e instanceof PonsAdapterError
            ? e.message
            : 'Launch confirmed but details could not be decoded. Do not launch again.',
      },
      updatedAt: Date.now(),
    };
    savePonsPendingLaunch(failed);
    return { outcome: 'TX_CONFIRMED_DECODE_FAILED', state: failed, receipt };
  }
}

/**
 * Retry decode only — requires existing ponsTxHash + successful receipt.
 */
export async function retryPonsReceiptDecode(args: {
  publicClient: PublicClient;
  draftId: string;
}): Promise<PonsRecoverResult> {
  return recoverPonsLaunchFromPending(args);
}
