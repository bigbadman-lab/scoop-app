import type { Queryable } from '@scoop/db';
import { getLatestQuotePriceUsd } from '@scoop/db';
import {
  fdvUsdX18FromPrice,
  normalizeAddress,
  priceUsdX18FromQuote,
} from '@scoop/shared';

export interface ResolvedQuoteUsd {
  quoteUsdX18: bigint | null;
  priceUsdX18: bigint | null;
  fdvUsdX18: bigint | null;
  reason: 'ok' | 'no_snapshot' | 'stale' | 'unsupported';
}

/**
 * Resolve quote/USD for market projections.
 * Unsupported or stale snapshots → null USD/FDV (honest gaps, no fabrication).
 */
export async function resolveUsdMarketFields(
  db: Queryable,
  args: {
    chainId: number;
    quoteAsset: string;
    priceQuoteX18: bigint;
    totalSupplyRaw: bigint;
    tokenDecimals: number;
    maxAgeSeconds: number;
    nowMs?: number;
  },
): Promise<ResolvedQuoteUsd> {
  const quoteAsset = normalizeAddress(args.quoteAsset);
  const latest = await getLatestQuotePriceUsd(db, args.chainId, quoteAsset);
  if (!latest) {
    return {
      quoteUsdX18: null,
      priceUsdX18: null,
      fdvUsdX18: null,
      reason: 'no_snapshot',
    };
  }

  const now = args.nowMs ?? Date.now();
  const observedMs =
    latest.observedAt instanceof Date
      ? latest.observedAt.getTime()
      : new Date(latest.observedAt).getTime();
  const ageSeconds = Math.max(0, Math.floor((now - observedMs) / 1000));
  const catalogueCap =
    latest.oracleMaxAge != null && latest.oracleMaxAge > 0
      ? latest.oracleMaxAge
      : args.maxAgeSeconds;
  const maxAge = Math.min(args.maxAgeSeconds, catalogueCap);

  if (ageSeconds > maxAge) {
    return {
      quoteUsdX18: null,
      priceUsdX18: null,
      fdvUsdX18: null,
      reason: 'stale',
    };
  }

  const quoteUsdX18 = BigInt(latest.priceUsdX18);
  if (quoteUsdX18 <= 0n) {
    return {
      quoteUsdX18: null,
      priceUsdX18: null,
      fdvUsdX18: null,
      reason: 'unsupported',
    };
  }

  const priceUsdX18 = priceUsdX18FromQuote({
    priceQuoteX18: args.priceQuoteX18,
    quoteUsdX18,
  });
  const fdvUsdX18 = fdvUsdX18FromPrice({
    priceUsdX18,
    totalSupplyRaw: args.totalSupplyRaw,
    tokenDecimals: args.tokenDecimals,
  });

  return { quoteUsdX18, priceUsdX18, fdvUsdX18, reason: 'ok' };
}
