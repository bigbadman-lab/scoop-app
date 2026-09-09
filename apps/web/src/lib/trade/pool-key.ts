import { NATIVE_ETH_ADDRESS } from '@scoop/shared';

export type ScoopPoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};

export type TradeSideMode = 'buy' | 'sell';

function asAddress(value: string): `0x${string}` {
  const v = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(v)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return v as `0x${string}`;
}

/**
 * Build PoolKey from indexed pool row fields.
 * Requires full key — never invents fee/tickSpacing/hooks.
 */
export function poolKeyFromIndexed(args: {
  currency0: string | null | undefined;
  currency1: string | null | undefined;
  fee: number | null | undefined;
  tickSpacing: number | null | undefined;
  hooks: string | null | undefined;
}): ScoopPoolKey | null {
  if (
    args.currency0 == null ||
    args.currency1 == null ||
    args.fee == null ||
    args.tickSpacing == null ||
    args.hooks == null
  ) {
    return null;
  }
  if (!Number.isFinite(args.fee) || args.fee < 0) return null;
  if (!Number.isFinite(args.tickSpacing) || args.tickSpacing === 0) return null;
  try {
    return {
      currency0: asAddress(args.currency0),
      currency1: asAddress(args.currency1),
      fee: Math.trunc(args.fee),
      tickSpacing: Math.trunc(args.tickSpacing),
      hooks: asAddress(args.hooks),
    };
  } catch {
    return null;
  }
}

export function isNativeCurrency(address: string): boolean {
  return address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase();
}

/**
 * BUY = spend quote → receive token.
 * SELL = spend token → receive quote.
 * zeroForOne when tokenIn is currency0 (SCOOP: quote is usually currency0 for ETH pools).
 */
export function zeroForOneForTrade(args: {
  mode: TradeSideMode;
  poolKey: ScoopPoolKey;
  quoteAsset: string;
  tokenAddress: string;
}): boolean {
  const quote = asAddress(args.quoteAsset);
  const token = asAddress(args.tokenAddress);
  const tokenIn = args.mode === 'buy' ? quote : token;
  return tokenIn === args.poolKey.currency0;
}

export function settleTakeCurrencies(args: {
  poolKey: ScoopPoolKey;
  zeroForOne: boolean;
}): { settle: `0x${string}`; take: `0x${string}` } {
  return {
    settle: args.zeroForOne ? args.poolKey.currency0 : args.poolKey.currency1,
    take: args.zeroForOne ? args.poolKey.currency1 : args.poolKey.currency0,
  };
}
