/**
 * Initial / dev buy for native ETH and ERC-20 quote assets.
 * Single source of truth for launch vs launchAndBuy selection and amount parsing.
 */
import { parseEther, parseUnits, zeroAddress } from 'viem';
import { NATIVE_ETH_ADDRESS } from '@scoop/shared';
import type { LaunchFormState } from '@/lib/launch/types';
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/trade/constants';
import { minimumAmountOut } from '@/lib/trade/slippage';

/** Soft ceiling for native ETH typos — not a protocol limit. Not applied to ERC-20. */
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
 * Canonical function selection: any enabled quote with positive quoteIn → launchAndBuy.
 * Accepts `quoteAmountIn` or legacy `quoteAmountInWei`.
 */
export function selectLaunchFunction(args: {
  quoteAsset: string;
  quoteAmountIn?: bigint;
  quoteAmountInWei?: bigint;
}): LaunchWriteFunction {
  const amount = args.quoteAmountIn ?? args.quoteAmountInWei ?? BigInt(0);
  if (amount > BigInt(0)) {
    return 'launchAndBuy';
  }
  return 'launch';
}

export type ParseDevBuyResult =
  | { ok: true; amount: bigint; /** Alias for ETH callers / older tests. */ wei: bigint }
  | { ok: false; error: string };

/**
 * Human decimal string → raw quote units using catalogue decimals.
 * Empty / 0 → 0n. Native ETH retains the soft 100 ETH typo ceiling.
 */
export function parseDevBuyAmount(args: {
  raw: string;
  decimals: number;
  quoteSymbol?: string | null;
  quoteAsset?: string | null;
}): ParseDevBuyResult {
  const buy = args.raw.trim();
  if (!buy || buy === '0' || /^0\.0+$/.test(buy)) {
    return { ok: true, amount: BigInt(0), wei: BigInt(0) };
  }
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > 36) {
    return { ok: false, error: 'Invalid quote decimals.' };
  }
  if (!/^\d+(\.\d+)?$/.test(buy)) {
    return { ok: false, error: 'Enter a valid amount.' };
  }
  const parts = buy.split('.');
  if (parts[1] && parts[1].length > args.decimals) {
    return {
      ok: false,
      error: `Too many decimal places (max ${args.decimals}).`,
    };
  }
  try {
    const amount = parseUnits(buy as `${number}`, args.decimals);
    if (amount < BigInt(0)) {
      return { ok: false, error: 'Amount cannot be negative.' };
    }
    if (isNativeEthQuote(args.quoteAsset)) {
      const maxWei = parseEther(`${MAX_ETH_DEV_BUY_ETH}`);
      if (amount > maxWei) {
        return { ok: false, error: `Amount exceeds ${MAX_ETH_DEV_BUY_ETH} ETH.` };
      }
    }
    return { ok: true, amount, wei: amount };
  } catch {
    const label = args.quoteSymbol?.trim() || 'quote';
    return { ok: false, error: `Enter a valid ${label} amount.` };
  }
}

/** Native ETH helper — same as parseDevBuyAmount(18) with ETH soft max. */
export function parseEthDevBuyWei(raw: string): ParseDevBuyResult {
  return parseDevBuyAmount({
    raw,
    decimals: 18,
    quoteSymbol: 'ETH',
    quoteAsset: zeroAddress,
  });
}

export type ResolveDevBuyResult =
  | {
      ok: true;
      /** Raw quote units (wei for ETH). */
      quoteAmountIn: bigint;
      /** Alias for checklist / older callers. */
      quoteAmountInWei: bigint;
      functionName: LaunchWriteFunction;
      msgValueWei: (launchFeeWei: bigint) => bigint;
    }
  | { ok: false; error: string };

function resolveQuoteDecimals(state: LaunchFormState): number | null {
  if (state.quoteDecimals != null && Number.isInteger(state.quoteDecimals)) {
    return state.quoteDecimals;
  }
  if (isNativeEthQuote(state.quoteAsset)) return 18;
  return null;
}

/**
 * Resolve form state into buy intent. Never silently ignores non-zero buy.
 * Native: msg.value = fee + quoteIn. ERC-20: msg.value = fee only.
 */
export function resolveDevBuyIntent(
  state: LaunchFormState,
  quoteAsset: string,
): ResolveDevBuyResult {
  const wantsBuy = wantsPositiveDevBuy(state.devBuyAmount);
  if (!wantsBuy) {
    return {
      ok: true,
      quoteAmountIn: BigInt(0),
      quoteAmountInWei: BigInt(0),
      functionName: 'launch',
      msgValueWei: (fee) => fee,
    };
  }

  const decimals = resolveQuoteDecimals(state);
  if (decimals == null) {
    return {
      ok: false,
      error: 'Quote decimals are required for an initial buy. Re-select the market pair.',
    };
  }

  const parsed = parseDevBuyAmount({
    raw: state.devBuyAmount,
    decimals,
    quoteSymbol: state.quoteSymbol,
    quoteAsset,
  });
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.amount <= BigInt(0)) {
    return {
      ok: true,
      quoteAmountIn: BigInt(0),
      quoteAmountInWei: BigInt(0),
      functionName: 'launch',
      msgValueWei: (fee) => fee,
    };
  }

  const native = isNativeEthQuote(quoteAsset);
  return {
    ok: true,
    quoteAmountIn: parsed.amount,
    quoteAmountInWei: parsed.amount,
    functionName: 'launchAndBuy',
    msgValueWei: (fee) => (native ? fee + parsed.amount : fee),
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
  return formatQuoteRaw(wei, 18);
}

/** Display helper for raw quote units — not used for tx math. */
export function formatQuoteRaw(raw: bigint, decimals: number): string {
  const neg = raw < BigInt(0);
  const abs = neg ? -raw : raw;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  if (!fracStr) return `${neg ? '-' : ''}${whole.toString()}`;
  return `${neg ? '-' : ''}${whole.toString()}.${fracStr}`;
}
