/**
 * Trading path safety (Gate 6 / Gate E).
 * Never send a Pons curve or Pump market through Scoop UV4 swap encoding.
 */

export type TradeableMarketSource = 'scoop' | 'pons_v2' | 'pump';

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
  if (source === 'pons_v2' || source === 'pump') {
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

export const PUMP_TRADE_EXTERNAL_COPY =
  'Trade this coin on Pump.fun — SCOOP Solana trading lands in a later gate.';
