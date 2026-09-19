/**
 * Pons launch + HoodLock lifecycle state (Gate 4 / Gate 5).
 */

import type { DevSupplyPolicy } from '@/lib/launch/dev-supply-policy';

export type PonsLaunchPhase =
  | 'draft'
  | 'review'
  | 'preflight'
  | 'simulating'
  | 'ready_to_sign'
  | 'launch_submitted'
  | 'launch_confirming'
  | 'launch_confirmed'
  | 'token_resolved'
  | 'dev_allocation_resolved'
  | 'lock_required'
  | 'lock_preflight'
  | 'approval_required'
  | 'approval_submitted'
  | 'approval_confirming'
  | 'approval_confirmed'
  | 'lock_ready'
  | 'lock_submitted'
  | 'lock_confirming'
  | 'lock_confirmed'
  | 'lock_verifying'
  | 'lock_verified'
  | 'burn_required'
  | 'burn_submitted'
  | 'burn_confirming'
  | 'burn_verifying'
  | 'burn_verified'
  | 'recoverable_failure'
  | 'complete';

/** JSON-safe decimal string for wei / token amounts. */
export type DecimalString = string;

type PonsPendingLaunchBase = {
  draftId: string;
  phase: PonsLaunchPhase;
  creator: `0x${string}`;
  chainId: number;
  salt: `0x${string}`;
  launchConfigId: DecimalString;
  pairToken: `0x${string}`;
  quoteInWei: DecimalString;
  slippageBps: number;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  farcaster: string;
  expectedEconomics: `0x${string}` | null;
  launchFeeWei: DecimalString | null;
  requiredMsgValueWei: DecimalString | null;
  simulatedTokenAddress: `0x${string}` | null;
  simulatedCurveAddress: `0x${string}` | null;
  simulatedTokensOut: DecimalString | null;
  minTokensOut: DecimalString | null;
  ponsTxHash: `0x${string}` | null;
  tokenAddress: `0x${string}` | null;
  curveAddress: `0x${string}` | null;
  devTokensOut: DecimalString | null;
  actualQuoteIn: DecimalString | null;
  refundWei: DecimalString | null;
  receiptBlockNumber: DecimalString | null;
  lastError: { code: string; message: string } | null;
  createdAt: number;
  updatedAt: number;
  hoodlockAddress: `0x${string}` | null;
  hoodlockFeeWei: DecimalString | null;
  lockReferenceTimestamp: DecimalString | null;
  unlockTime: DecimalString | null;
  approvalRequired: boolean | null;
  hoodlockAllowanceWei: DecimalString | null;
  hoodlockApprovalTxHash: `0x${string}` | null;
  hoodlockLockTxHash: `0x${string}` | null;
  hoodlockLockId: DecimalString | null;
  hoodlockLockedAmount: DecimalString | null;
  hoodlockVerified: boolean | null;
  hoodlockVerificationBlock: DecimalString | null;
  /**
   * Chosen before LaunchAndBuy. Missing values are lock_6m.
   * Immutable once ponsTxHash exists.
   */
  devSupplyPolicy?: DevSupplyPolicy;
  burnTxHash?: `0x${string}` | null;
  burnVerified?: boolean | null;
  burnVerifiedAt?: number | null;
};

/** Gate 4 schema (still readable). */
export type PonsPendingLaunchStateV1 = PonsPendingLaunchBase & {
  version: 1;
};

/** Gate 5 schema — Gate 4 fields + HoodLock (may still be version 1 with null HoodLock). */
export type PonsPendingLaunchState = PonsPendingLaunchBase & {
  version: 1 | 2;
};

export type PonsRecoveryOutcome =
  | 'TX_PENDING'
  | 'TX_REVERTED'
  | 'TX_CONFIRMED_RECOVERED'
  | 'TX_CONFIRMED_DECODE_FAILED'
  | 'ALREADY_LOCK_REQUIRED'
  | 'NOTHING_TO_RECOVER';

export type HoodlockRecoveryOutcome =
  | 'APPROVAL_PENDING'
  | 'APPROVAL_CONFIRMED_RECOVERED'
  | 'APPROVAL_REVERTED'
  | 'LOCK_PENDING'
  | 'LOCK_REVERTED'
  | 'LOCK_CONFIRMED_RECOVERED'
  | 'LOCK_ALREADY_VERIFIED'
  | 'LOCK_RECOVERY_UNRESOLVED'
  | 'LOCK_ALREADY_EXISTS';

export function emptyHoodlockFields(): Pick<
  PonsPendingLaunchState,
  | 'hoodlockAddress'
  | 'hoodlockFeeWei'
  | 'lockReferenceTimestamp'
  | 'unlockTime'
  | 'approvalRequired'
  | 'hoodlockAllowanceWei'
  | 'hoodlockApprovalTxHash'
  | 'hoodlockLockTxHash'
  | 'hoodlockLockId'
  | 'hoodlockLockedAmount'
  | 'hoodlockVerified'
  | 'hoodlockVerificationBlock'
> {
  return {
    hoodlockAddress: null,
    hoodlockFeeWei: null,
    lockReferenceTimestamp: null,
    unlockTime: null,
    approvalRequired: null,
    hoodlockAllowanceWei: null,
    hoodlockApprovalTxHash: null,
    hoodlockLockTxHash: null,
    hoodlockLockId: null,
    hoodlockLockedAmount: null,
    hoodlockVerified: null,
    hoodlockVerificationBlock: null,
  };
}

export function isLaunchCommitted(
  state: Pick<PonsPendingLaunchState, 'ponsTxHash' | 'tokenAddress' | 'curveAddress'>,
): boolean {
  return Boolean(state.ponsTxHash || state.tokenAddress || state.curveAddress);
}

export function isLockCommitted(
  state: Pick<
    PonsPendingLaunchState,
    'hoodlockLockTxHash' | 'hoodlockLockId' | 'hoodlockVerified'
  >,
): boolean {
  return Boolean(
    state.hoodlockLockTxHash ||
      state.hoodlockLockId ||
      state.hoodlockVerified === true,
  );
}

export function bigintToDecimal(value: bigint): DecimalString {
  return value.toString(10);
}

export function decimalToBigint(value: DecimalString | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  if (!/^-?\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
