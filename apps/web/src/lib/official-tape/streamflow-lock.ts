/**
 * Streamflow token-lock parameter builders (SDK 13.4.0 semantics).
 * True time lock via createLock / buildLockParams — not gradual vesting.
 */

import BN from 'bn.js';
import { buildLockParams, type ICreateLinearStreamData } from '@streamflow/stream';
import { OFFICIAL_TAPE_DEPLOYER } from '@/lib/official-tape/constants';

export type StreamflowDustPlan = {
  /** Full deployer raw balance intended for the lock contract. */
  lockAmountRaw: bigint;
  /** Amount unlocked at cliff (unlock date) — amount - 1 when amount > 1. */
  cliffAmountRaw: bigint;
  /** Residual raw units released 1s after cliff (Streamflow app token-lock criteria). */
  dustResidueRaw: bigint;
  /** Product language when dustResidueRaw > 0. */
  productLanguage: 'full economically meaningful dev allocation' | '100% of deployer balance';
};

/**
 * Streamflow token-lock dust: cliffAmount = amount - 1, amountPerPeriod = 1, period = 1.
 * Never claim literal 100% when residue exists.
 */
export function planStreamflowLockDust(lockAmountRaw: bigint): StreamflowDustPlan {
  if (lockAmountRaw <= BigInt(0)) {
    throw new Error('lock amount must be positive');
  }
  if (lockAmountRaw === BigInt(1)) {
    return {
      lockAmountRaw,
      cliffAmountRaw: BigInt(0),
      dustResidueRaw: BigInt(1),
      productLanguage: 'full economically meaningful dev allocation',
    };
  }
  return {
    lockAmountRaw,
    cliffAmountRaw: lockAmountRaw - BigInt(1),
    dustResidueRaw: BigInt(1),
    productLanguage: 'full economically meaningful dev allocation',
  };
}

export function buildOfficialTapeLockStreamParams(args: {
  mint: string;
  lockAmountRaw: bigint;
  unlockUnix: number;
  name?: string;
  recipient?: string;
}): ICreateLinearStreamData {
  const dust = planStreamflowLockDust(args.lockAmountRaw);
  const params = buildLockParams({
    recipient: args.recipient ?? OFFICIAL_TAPE_DEPLOYER,
    tokenId: args.mint,
    amount: new BN(dust.lockAmountRaw.toString()),
    unlockDate: args.unlockUnix,
    name: args.name ?? 'SCOOP official $TAPE 6-month dev lock',
    transferableByRecipient: false,
  });
  // Defense: cancelable / transferable must stay false for official lock labeling.
  return {
    ...params,
    cancelableBySender: false,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    canTopup: false,
  };
}

export function assertLockConfirmPhrase(confirm: string | null | undefined): void {
  if (confirm !== 'LOCK TAPE FOR 6 MONTHS') {
    throw new Error(
      'Refusing Streamflow broadcast without exact confirmation phrase: LOCK TAPE FOR 6 MONTHS',
    );
  }
}
