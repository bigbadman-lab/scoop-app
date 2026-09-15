/**
 * HoodLock TGE fee ceiling checks (integer wei only).
 */
import { formatEther } from 'viem';
import { HOODLOCK_TGE_MAX_FEE_WEI } from './tge-constants.mjs';

/**
 * @param {bigint} liveFeeWei
 */
export function assertHoodlockFeeWithinTgeLimit(liveFeeWei) {
  const fee =
    typeof liveFeeWei === 'bigint' ? liveFeeWei : BigInt(liveFeeWei);
  if (fee > HOODLOCK_TGE_MAX_FEE_WEI) {
    return {
      ok: false,
      reason: 'BLOCKED — HOODLOCK FEE EXCEEDS TGE SAFETY LIMIT',
      liveFeeWei: fee,
      maxFeeWei: HOODLOCK_TGE_MAX_FEE_WEI,
      liveFeeEth: formatEther(fee),
      maxFeeEth: formatEther(HOODLOCK_TGE_MAX_FEE_WEI),
    };
  }
  return {
    ok: true,
    reason: null,
    liveFeeWei: fee,
    maxFeeWei: HOODLOCK_TGE_MAX_FEE_WEI,
    liveFeeEth: formatEther(fee),
    maxFeeEth: formatEther(HOODLOCK_TGE_MAX_FEE_WEI),
    /** Exact live fee — never the ceiling unless live equals ceiling. */
    txValueWei: fee,
  };
}

export { HOODLOCK_TGE_MAX_FEE_WEI };
