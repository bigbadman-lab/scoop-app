/**
 * User-safe copy primitives for Pons launch + HoodLock lifecycle (Gate 4 / 5).
 * Not yet wired into production UI.
 */

import type { PonsLaunchPhase } from './lifecycle-types';

export const PONS_LIFECYCLE_COPY = {
  preBroadcastFailure: {
    title: 'Launch not submitted',
    body: 'You can safely try again.',
  },
  transactionPending: {
    title: 'Launch transaction submitted',
    body: 'Waiting for confirmation…',
  },
  confirmedDecodeIssue: {
    title: 'Token launched — recovery incomplete',
    body: 'Your token was launched, but SCOOP has not finished recovering the launch details. Do not launch again.',
  },
  lockRequired: {
    title: 'Token launched successfully',
    body: 'Dev token lock still required.',
  },
  approvalNeeded: {
    title: 'Approve your dev tokens for locking.',
    body: 'Approve your dev tokens for locking.',
  },
  lockReady: {
    title: 'Ready to lock',
    body: 'Dev tokens approved. Ready to lock for 6 months.',
  },
  lockPending: {
    title: 'Lock transaction submitted',
    body: 'Waiting for confirmation…',
  },
  lockVerifying: {
    title: 'Lock confirmed',
    body: 'Verifying the 6-month lock onchain…',
  },
  lockComplete: {
    title: 'Dev tokens locked for 6 months.',
    body: 'Dev tokens locked for 6 months.',
  },
  lockRecoverableFailure: {
    title: 'Your token is already live.',
    body: 'The dev-token lock is incomplete. Resume the lock — do not launch again.',
  },
  recoverableFailureGeneric: {
    title: 'Launch needs attention',
    body: 'Do not launch again until SCOOP finishes recovering this draft.',
  },
} as const;

export function ponsLifecycleUserMessage(phase: PonsLaunchPhase): {
  title: string;
  body: string;
} {
  switch (phase) {
    case 'launch_submitted':
    case 'launch_confirming':
      return PONS_LIFECYCLE_COPY.transactionPending;
    case 'approval_required':
    case 'lock_preflight':
      return PONS_LIFECYCLE_COPY.approvalNeeded;
    case 'approval_submitted':
    case 'approval_confirming':
      return {
        title: 'Approval submitted',
        body: 'Waiting for confirmation…',
      };
    case 'approval_confirmed':
    case 'lock_ready':
      return PONS_LIFECYCLE_COPY.lockReady;
    case 'lock_submitted':
    case 'lock_confirming':
      return PONS_LIFECYCLE_COPY.lockPending;
    case 'lock_confirmed':
    case 'lock_verifying':
      return PONS_LIFECYCLE_COPY.lockVerifying;
    case 'lock_verified':
    case 'complete':
      return PONS_LIFECYCLE_COPY.lockComplete;
    case 'burn_required':
      return {
        title: 'Token launched successfully',
        body: 'Dev supply burn still required. Do not launch again.',
      };
    case 'burn_submitted':
    case 'burn_confirming':
      return {
        title: 'Burning dev supply',
        body: 'Waiting for confirmation…',
      };
    case 'burn_verifying':
      return {
        title: 'Verifying burn',
        body: 'Verifying the burn onchain…',
      };
    case 'burn_verified':
      return {
        title: 'Dev supply burned.',
        body: 'Dev supply burned. Waiting for market indexing.',
      };
    case 'recoverable_failure':
      return PONS_LIFECYCLE_COPY.lockRecoverableFailure;
    case 'lock_required':
    case 'dev_allocation_resolved':
    case 'token_resolved':
    case 'launch_confirmed':
      return PONS_LIFECYCLE_COPY.lockRequired;
    default:
      return PONS_LIFECYCLE_COPY.preBroadcastFailure;
  }
}
