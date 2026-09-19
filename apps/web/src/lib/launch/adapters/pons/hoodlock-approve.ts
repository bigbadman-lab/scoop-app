/**
 * Exact ERC-20 approval for HoodLock (never unlimited).
 */
import { getAddress } from 'viem';
import { PonsAdapterError } from './errors';
import { erc20ApproveAbi } from './hoodlock-abi';
import {
  ERC20_MAX_UINT256,
  HOODLOCK_LOCKER_ADDRESS,
} from './hoodlock-constants';

export type HoodlockApprovalRequest = {
  address: `0x${string}`;
  abi: typeof erc20ApproveAbi;
  functionName: 'approve';
  args: readonly [`0x${string}`, bigint];
  account: `0x${string}`;
};

/**
 * Build exact-amount approve(HoodLock, exactLockAmount).
 * Rejects unlimited / over-approval.
 */
export function buildExactHoodlockApproval(args: {
  token: `0x${string}`;
  creator: `0x${string}`;
  exactLockAmount: bigint;
  spender?: `0x${string}`;
}): HoodlockApprovalRequest {
  if (args.exactLockAmount <= BigInt(0)) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Approval amount must be the exact positive lock amount.',
    );
  }
  if (args.exactLockAmount >= ERC20_MAX_UINT256) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Unlimited ERC-20 approval is not allowed for HoodLock.',
    );
  }

  const spender = getAddress(
    args.spender ?? HOODLOCK_LOCKER_ADDRESS,
  ) as `0x${string}`;
  const token = getAddress(args.token) as `0x${string}`;
  const creator = getAddress(args.creator) as `0x${string}`;

  return {
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'approve',
    args: [spender, args.exactLockAmount] as const,
    account: creator,
  };
}

export function classifyHoodlockApprovalNeed(args: {
  currentAllowance: bigint;
  exactLockAmount: bigint;
}): { needsApprove: boolean; status: 'ALREADY_COMPLETE' | 'READY' } {
  if (args.currentAllowance >= args.exactLockAmount) {
    return { needsApprove: false, status: 'ALREADY_COMPLETE' };
  }
  return { needsApprove: true, status: 'READY' };
}
