import { PonsAdapterError } from './errors';
import {
  isLaunchCommitted,
  type PonsPendingLaunchState,
} from './lifecycle-types';

/**
 * Hard relaunch prevention (Gate 4).
 * Any draft with ponsTxHash or resolved token/curve evidence must not launch again.
 */
export function assertPonsRelaunchAllowed(
  state: Pick<
    PonsPendingLaunchState,
    'draftId' | 'ponsTxHash' | 'tokenAddress' | 'curveAddress' | 'phase'
  >,
): void {
  if (!isLaunchCommitted(state)) return;

  const evidence = state.ponsTxHash
    ? `tx ${state.ponsTxHash}`
    : state.tokenAddress
      ? `token ${state.tokenAddress}`
      : `curve ${state.curveAddress}`;

  throw new PonsAdapterError(
    'RELAUNCH_BLOCKED',
    `Launch already submitted for this draft (${evidence}). Do not launch again.`,
    {
      cause: {
        code: 'LAUNCH_ALREADY_SUBMITTED',
        draftId: state.draftId,
        ponsTxHash: state.ponsTxHash,
        tokenAddress: state.tokenAddress,
        curveAddress: state.curveAddress,
        phase: state.phase,
      },
    },
  );
}

export function ponsRelaunchBlockedReason(
  state: Pick<PonsPendingLaunchState, 'ponsTxHash' | 'tokenAddress' | 'curveAddress'>,
): string | null {
  if (!isLaunchCommitted(state)) return null;
  if (state.ponsTxHash) return 'LAUNCH_ALREADY_SUBMITTED';
  return 'RELAUNCH_BLOCKED';
}
