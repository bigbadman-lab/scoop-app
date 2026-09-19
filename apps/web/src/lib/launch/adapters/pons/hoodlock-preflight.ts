/**
 * HoodLock read-only preflight from Gate 4 lock_required (Gate 5).
 */
import type { PublicClient } from 'viem';
import { getAddress } from 'viem';
import { proposeSixMonthUnlock } from '@scoop/shared';
import { PonsAdapterError } from './errors';
import { erc20ApproveAbi, hoodlockLockerAbi } from './hoodlock-abi';
import {
  HOODLOCK_CHAIN_ID,
  HOODLOCK_GAS_HEADROOM_WEI,
  HOODLOCK_LOCKER_ADDRESS,
} from './hoodlock-constants';
import {
  bigintToDecimal,
  decimalToBigint,
  type PonsPendingLaunchState,
} from './lifecycle-types';
import { savePonsPendingLaunch } from './pending-storage';

export type HoodlockPreflightResult = {
  state: PonsPendingLaunchState;
  exactLockAmount: bigint;
  feeWei: bigint;
  ethBalanceWei: bigint;
  tokenBalance: bigint;
  allowanceWei: bigint;
  approvalRequired: boolean;
  unlockTime: bigint;
  lockReferenceTimestamp: number;
  hoodlockAddress: `0x${string}`;
};

function requireExactDevTokens(state: PonsPendingLaunchState): bigint {
  const amount = decimalToBigint(state.devTokensOut);
  if (amount == null || amount <= BigInt(0)) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Exact dev token allocation missing. Resume launch recovery before locking.',
    );
  }
  return amount;
}

/**
 * Read-only preflight. Persists fee / allowance / unlock proposal.
 * Never estimates allocation — always uses Gate 4 `devTokensOut`.
 */
export async function runHoodlockPreflight(args: {
  publicClient: PublicClient;
  state: PonsPendingLaunchState;
  chainId: number;
  /** Optional wall/chain unix override for tests. */
  chainTimestampUnix?: number;
}): Promise<HoodlockPreflightResult> {
  const { publicClient, state } = args;

  if (args.chainId !== HOODLOCK_CHAIN_ID) {
    throw new PonsAdapterError(
      'WRONG_CHAIN',
      `HoodLock requires Robinhood Chain (${HOODLOCK_CHAIN_ID}).`,
    );
  }

  if (!state.tokenAddress) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Token address missing from launch draft.',
    );
  }
  if (!state.creator) {
    throw new PonsAdapterError('INVALID_INPUT', 'Creator missing from launch draft.');
  }

  const exactLockAmount = requireExactDevTokens(state);
  const creator = getAddress(state.creator) as `0x${string}`;
  const token = getAddress(state.tokenAddress) as `0x${string}`;
  const hoodlock = getAddress(HOODLOCK_LOCKER_ADDRESS) as `0x${string}`;

  let next: PonsPendingLaunchState = {
    ...state,
    phase: 'lock_preflight',
    hoodlockAddress: hoodlock,
    lastError: null,
    updatedAt: Date.now(),
  };
  savePonsPendingLaunch(next);

  const feeWei = (await publicClient.readContract({
    address: hoodlock,
    abi: hoodlockLockerAbi,
    functionName: 'fee',
  })) as bigint;

  const ethBalanceWei = await publicClient.getBalance({ address: creator });
  const requiredEth = feeWei + HOODLOCK_GAS_HEADROOM_WEI;
  if (ethBalanceWei < requiredEth) {
    throw new PonsAdapterError(
      'INSUFFICIENT_ETH',
      'Not enough ETH to cover the HoodLock fee and gas.',
    );
  }

  const allowanceWei = (await publicClient.readContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [creator, hoodlock],
  })) as bigint;

  const tokenBalance = (await publicClient.readContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'balanceOf',
    args: [creator],
  })) as bigint;

  if (tokenBalance < exactLockAmount) {
    throw new PonsAdapterError(
      'INSUFFICIENT_TOKEN_BALANCE',
      'Creator token balance is below the exact launch allocation to lock.',
    );
  }

  let chainTimestampUnix = args.chainTimestampUnix;
  if (chainTimestampUnix == null) {
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    chainTimestampUnix = Number(block.timestamp);
  }

  const unlockTimeNum = proposeSixMonthUnlock({
    chainTimestampUnix,
  });
  const unlockTime = BigInt(unlockTimeNum);
  const approvalRequired = allowanceWei < exactLockAmount;

  next = {
    ...next,
    phase: approvalRequired ? 'approval_required' : 'lock_ready',
    hoodlockFeeWei: bigintToDecimal(feeWei),
    hoodlockAllowanceWei: bigintToDecimal(allowanceWei),
    approvalRequired,
    lockReferenceTimestamp: bigintToDecimal(BigInt(chainTimestampUnix)),
    unlockTime: bigintToDecimal(unlockTime),
    updatedAt: Date.now(),
  };
  // Skip approval phases when allowance already sufficient.
  if (!approvalRequired) {
    next = {
      ...next,
      phase: 'lock_ready',
      approvalRequired: false,
      updatedAt: Date.now(),
    };
  }
  savePonsPendingLaunch(next);

  return {
    state: next,
    exactLockAmount,
    feeWei,
    ethBalanceWei,
    tokenBalance,
    allowanceWei,
    approvalRequired,
    unlockTime,
    lockReferenceTimestamp: chainTimestampUnix,
    hoodlockAddress: hoodlock,
  };
}
