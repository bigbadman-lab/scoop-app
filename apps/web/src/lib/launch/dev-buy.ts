/**
 * ETH-only initial dev buy (V2.G).
 * Single source of truth for launch vs launchAndBuy selection.
 */
import { parseEther, zeroAddress } from 'viem';
import { NATIVE_ETH_ADDRESS } from '@scoop/shared';
import type { LaunchFormState } from '@/lib/launch/types';
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/trade/constants';
import { minimumAmountOut } from '@/lib/trade/slippage';

/** Soft ceiling to catch typos — not a protocol limit. */
export const MAX_ETH_DEV_BUY_ETH = 100;

export const LAUNCH_DEV_BUY_SLIPPAGE_BPS = DEFAULT_SLIPPAGE_BPS;

export type LaunchWriteFunction = 'launch' | 'launchAndBuy';

function wantsPositiveDevBuy(raw: string): boolean {
  const buy = raw.trim();
  if (!buy) return false;
  const n = Number(buy);
  return Number.isFinite(n) && n > 0;
}
export function isNativeEthQuote(quoteAsset: string | null | undefined): boolean {
  if (!quoteAsset) return false;
  const q = quoteAsset.trim().toLowerCase();
  return q === zeroAddress || q === NATIVE_ETH_ADDRESS.toLowerCase();
}

/**
 * Canonical function selection.
 * Non-ETH + positive buy must be rejected before this is called with a positive amount.
 */
export function selectLaunchFunction(args: {
  quoteAsset: string;
  quoteAmountInWei: bigint;
}): LaunchWriteFunction {
  if (args.quoteAmountInWei > BigInt(0) && isNativeEthQuote(args.quoteAsset)) {
    return 'launchAndBuy';
  }
  return 'launch';
}

export type ParseEthDevBuyResult =
  | { ok: true; wei: bigint }
  | { ok: false; error: string };

/**
 * Human decimal ETH string → wei. Empty / 0 → 0n.
 * Rejects scientific notation, negatives, excess precision, oversized values.
 */
export function parseEthDevBuyWei(raw: string): ParseEthDevBuyResult {
  const buy = raw.trim();
  if (!buy || buy === '0' || /^0\.0+$/.test(buy)) {
    return { ok: true, wei: BigInt(0) };
  }
  if (!/^\d+(\.\d+)?$/.test(buy)) {
    return { ok: false, error: 'Enter a valid ETH amount.' };
  }
  const parts = buy.split('.');
  if (parts[1] && parts[1].length > 18) {
    return { ok: false, error: 'Too many decimal places (max 18).' };
  }
  try {
    const wei = parseEther(buy as `${number}`);
    if (wei < BigInt(0)) {
      return { ok: false, error: 'Amount cannot be negative.' };
    }
    const maxWei = parseEther(`${MAX_ETH_DEV_BUY_ETH}`);
    if (wei > maxWei) {
      return { ok: false, error: `Amount exceeds ${MAX_ETH_DEV_BUY_ETH} ETH.` };
    }
    return { ok: true, wei };
  } catch {
    return { ok: false, error: 'Enter a valid ETH amount.' };
  }
}

export type ResolveDevBuyResult =
  | {
      ok: true;
      quoteAmountInWei: bigint;
      functionName: LaunchWriteFunction;
      msgValueWei: (launchFeeWei: bigint) => bigint;
    }
  | { ok: false; error: string };

/**
 * Resolve form state into buy intent. Never silently ignores non-zero buy.
 */
export function resolveDevBuyIntent(
  state: LaunchFormState,
  quoteAsset: string,
): ResolveDevBuyResult {
  const wantsBuy = wantsPositiveDevBuy(state.devBuyAmount);
  if (!wantsBuy) {
    return {
      ok: true,
      quoteAmountInWei: BigInt(0),
      functionName: 'launch',
      msgValueWei: (fee) => fee,
    };
  }

  if (!isNativeEthQuote(quoteAsset)) {
    return {
      ok: false,
      error: 'Initial buy is currently available for ETH pairs only.',
    };
  }

  const parsed = parseEthDevBuyWei(state.devBuyAmount);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.wei <= BigInt(0)) {
    return {
      ok: true,
      quoteAmountInWei: BigInt(0),
      functionName: 'launch',
      msgValueWei: (fee) => fee,
    };
  }

  return {
    ok: true,
    quoteAmountInWei: parsed.wei,
    functionName: 'launchAndBuy',
    msgValueWei: (fee) => fee + parsed.wei,
  };
}

/** Apply trade slippage helper to simulated tokensBought. */
export function computeMinTokensOut(
  expectedTokensOut: bigint,
  slippageBps: number = LAUNCH_DEV_BUY_SLIPPAGE_BPS,
): bigint {
  if (expectedTokensOut <= BigInt(0)) {
    throw new Error('Expected token output must be positive.');
  }
  const min = minimumAmountOut(expectedTokensOut, slippageBps);
  if (min <= BigInt(0)) {
    throw new Error('minTokensOut rounded to zero — reduce slippage or increase buy.');
  }
  return min;
}

export function formatEthWei(wei: bigint): string {
  // Display helper — not used for tx math.
  const neg = wei < BigInt(0);
  const abs = neg ? -wei : wei;
  const whole = abs / BigInt(10) ** BigInt(18);
  const frac = abs % BigInt(10) ** BigInt(18);
  let fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  if (!fracStr) return `${neg ? '-' : ''}${whole.toString()}`;
  return `${neg ? '-' : ''}${whole.toString()}.${fracStr}`;
}
