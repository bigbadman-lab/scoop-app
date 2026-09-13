/** Lowercase 0x-prefixed address used across SCOOP indexing. */
export type OrientationAddress = `0x${string}`;

function normalizeAddress(address: string): OrientationAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase() as OrientationAddress;
}

export type PoolOrientation = {
  currency0: OrientationAddress;
  currency1: OrientationAddress;
  tokenIsCurrency1: boolean;
};

/**
 * Uniswap v4 PoolKey currency order: currency0 < currency1 by address (uint160).
 * Native ETH is `address(0)` / ZERO_ADDRESS and is always currency0 when quoted.
 *
 * Prefer this deterministic sort from (token, quote). When Initialize currencies
 * are supplied, they must match the same sorted pair — otherwise throw rather
 * than silently assume orientation.
 */
export function resolvePoolOrientation(args: {
  tokenAddress: string;
  quoteAsset: string;
  /** Optional Initialize / stored pool currencies for validation. */
  currency0?: string | null;
  currency1?: string | null;
  /**
   * When supplied currencies match {token, quote} but are out of canonical order:
   * - `throw` (default): fail closed (Initialize / write path)
   * - `prefer-sorted`: heal using address sort (watchlist load of stale rows)
   */
  onCurrencyMismatch?: 'throw' | 'prefer-sorted';
}): PoolOrientation {
  const token = normalizeAddress(args.tokenAddress);
  const quote = normalizeAddress(args.quoteAsset);
  if (token === quote) {
    throw new Error(`token and quote must differ: ${token}`);
  }

  const sorted: PoolOrientation =
    token < quote
      ? { currency0: token, currency1: quote, tokenIsCurrency1: false }
      : { currency0: quote, currency1: token, tokenIsCurrency1: true };

  if (args.currency0 != null && args.currency1 != null) {
    const c0 = normalizeAddress(args.currency0);
    const c1 = normalizeAddress(args.currency1);
    const pair = new Set([c0, c1]);
    if (pair.size !== 2 || !pair.has(token) || !pair.has(quote)) {
      throw new Error(
        `Pool currencies [${c0},${c1}] do not match token=${token} quote=${quote}`,
      );
    }
    if (c0 !== sorted.currency0 || c1 !== sorted.currency1) {
      if ((args.onCurrencyMismatch ?? 'throw') === 'prefer-sorted') {
        return sorted;
      }
      throw new Error(
        `Pool currencies not in canonical order: got [${c0},${c1}] expected [${sorted.currency0},${sorted.currency1}]`,
      );
    }
  }

  return sorted;
}

/**
 * Absolute quote/token legs from Uniswap Swap amount0/amount1 deltas.
 * Project convention (matches Factory initial-buy + HELLO): for a buy, the quote
 * currency delta is negative and the token currency delta is positive.
 */
export function quoteAndTokenAmountsFromSwapDeltas(args: {
  amount0: bigint;
  amount1: bigint;
  tokenIsCurrency1: boolean;
}): { quoteAmountRaw: bigint; tokenAmountRaw: bigint } {
  const abs0 = args.amount0 < 0n ? -args.amount0 : args.amount0;
  const abs1 = args.amount1 < 0n ? -args.amount1 : args.amount1;
  if (args.tokenIsCurrency1) {
    return { quoteAmountRaw: abs0, tokenAmountRaw: abs1 };
  }
  return { quoteAmountRaw: abs1, tokenAmountRaw: abs0 };
}

/**
 * Synthesize Swap-shaped amount0/amount1 for an initial buy when no Swap log exists.
 */
export function initialBuySwapDeltas(args: {
  quoteAmountRaw: bigint;
  tokenAmountRaw: bigint;
  tokenIsCurrency1: boolean;
}): { amount0: bigint; amount1: bigint } {
  if (args.quoteAmountRaw < 0n || args.tokenAmountRaw < 0n) {
    throw new Error('initial buy amounts must be non-negative');
  }
  if (args.tokenIsCurrency1) {
    return { amount0: -args.quoteAmountRaw, amount1: args.tokenAmountRaw };
  }
  return { amount0: args.tokenAmountRaw, amount1: -args.quoteAmountRaw };
}
