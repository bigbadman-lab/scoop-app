/**
 * Trading path safety (Gate 6).
 * Never send a Pons curve market through Scoop UV4 swap encoding.
 */

export type TradeableMarketSource = 'scoop' | 'pons_v2';

export function canUseScoopUv4TradePath(args: {
  marketSource: TradeableMarketSource | string | null | undefined;
  marketPhase?: 'curve' | 'graduated_pool' | null;
  currency0?: string | null;
  currency1?: string | null;
  poolFee?: number | null;
  tickSpacing?: number | null;
  hooks?: string | null;
}): boolean {
  const source = args.marketSource ?? 'scoop';
  if (source === 'pons_v2') {
    // Pre-graduation curve markets must never use Scoop UV4 swap.
    // Graduated pools may gain a trade path later — still blocked until implemented.
    return false;
  }
  if (
    args.currency0 == null ||
    args.currency1 == null ||
    args.poolFee == null ||
    args.tickSpacing == null ||
    args.hooks == null
  ) {
    return false;
  }
  return true;
}

export const PONS_TRADE_DISABLED_COPY =
  'Trading integration for this Pons market is not enabled yet.';
