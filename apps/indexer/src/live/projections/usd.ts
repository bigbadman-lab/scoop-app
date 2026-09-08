import type { Queryable } from '@scoop/db';
import { getLatestQuotePriceUsd, getQuotePriceUsdAtOrBefore } from '@scoop/db';
import {
  fdvUsdX18FromPrice,
  normalizeAddress,
  notionalUsdX18FromQuoteAmount,
  priceUsdX18FromQuote,
} from '@scoop/shared';

type SnapshotRow = NonNullable<Awaited<ReturnType<typeof getLatestQuotePriceUsd>>>;

export interface ResolvedQuoteUsd {
  quoteUsdX18: bigint | null;
  priceUsdX18: bigint | null;
  fdvUsdX18: bigint | null;
  reason: 'ok' | 'no_snapshot' | 'stale' | 'unsupported';
}

export interface ResolvedTradeUsd {
  quoteUsdX18: bigint | null;
  executionPriceUsdX18: bigint | null;
  usdValueX18: bigint | null;
  reason: 'ok' | 'no_snapshot' | 'stale' | 'unsupported';
}

/** effective max age = min(product max, catalogue oracle max when present) */
export function effectiveQuoteUsdMaxAge(
  productMaxAgeSeconds: number,
  oracleMaxAge: number | null | undefined,
): number {
  if (oracleMaxAge != null && oracleMaxAge > 0) {
    return Math.min(productMaxAgeSeconds, oracleMaxAge);
  }
  return productMaxAgeSeconds;
}

function ageSecondsAt(nowMs: number, observedAt: Date | string): number {
  const observedMs =
    observedAt instanceof Date ? observedAt.getTime() : new Date(observedAt).getTime();
  return Math.max(0, Math.floor((nowMs - observedMs) / 1000));
}

function acceptSnapshot(
  latest: SnapshotRow,
  nowMs: number,
  maxAgeSeconds: number,
): { ok: true; quoteUsdX18: bigint } | { ok: false; reason: 'stale' | 'unsupported' } {
  const maxAge = effectiveQuoteUsdMaxAge(maxAgeSeconds, latest.oracleMaxAge);
  if (ageSecondsAt(nowMs, latest.observedAt) > maxAge) {
    return { ok: false, reason: 'stale' };
  }
  const quoteUsdX18 = BigInt(latest.priceUsdX18);
  if (quoteUsdX18 <= 0n) {
    return { ok: false, reason: 'unsupported' };
  }
  return { ok: true, quoteUsdX18 };
}

/**
 * Resolve quote/USD for market projections (latest fresh snapshot).
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
  const accepted = acceptSnapshot(latest, now, args.maxAgeSeconds);
  if (!accepted.ok) {
    return {
      quoteUsdX18: null,
      priceUsdX18: null,
      fdvUsdX18: null,
      reason: accepted.reason,
    };
  }

  const priceUsdX18 = priceUsdX18FromQuote({
    priceQuoteX18: args.priceQuoteX18,
    quoteUsdX18: accepted.quoteUsdX18,
  });
  const fdvUsdX18 = fdvUsdX18FromPrice({
    priceUsdX18,
    totalSupplyRaw: args.totalSupplyRaw,
    tokenDecimals: args.tokenDecimals,
  });

  return {
    quoteUsdX18: accepted.quoteUsdX18,
    priceUsdX18,
    fdvUsdX18,
    reason: 'ok',
  };
}

/**
 * Trade-time USD: nearest snapshot at or before trade timestamp within freshness.
 * Never uses "current" quote/USD for historical trades.
 */
export async function resolveTradeUsdFields(
  db: Queryable,
  args: {
    chainId: number;
    quoteAsset: string;
    quoteAmountRaw: bigint;
    executionPriceQuoteX18: bigint;
    quoteDecimals: number;
    tradeTimestampSec: number;
    maxAgeSeconds: number;
  },
): Promise<ResolvedTradeUsd> {
  const quoteAsset = normalizeAddress(args.quoteAsset);
  const latest = await getQuotePriceUsdAtOrBefore(
    db,
    args.chainId,
    quoteAsset,
    args.tradeTimestampSec,
  );
  if (!latest) {
    return {
      quoteUsdX18: null,
      executionPriceUsdX18: null,
      usdValueX18: null,
      reason: 'no_snapshot',
    };
  }

  const tradeMs = args.tradeTimestampSec * 1000;
  const accepted = acceptSnapshot(latest, tradeMs, args.maxAgeSeconds);
  if (!accepted.ok) {
    return {
      quoteUsdX18: null,
      executionPriceUsdX18: null,
      usdValueX18: null,
      reason: accepted.reason,
    };
  }

  const executionPriceUsdX18 = priceUsdX18FromQuote({
    priceQuoteX18: args.executionPriceQuoteX18,
    quoteUsdX18: accepted.quoteUsdX18,
  });
  const usdValueX18 = notionalUsdX18FromQuoteAmount({
    quoteAmountRaw: args.quoteAmountRaw,
    quoteUsdX18: accepted.quoteUsdX18,
    quoteDecimals: args.quoteDecimals,
  });

  return {
    quoteUsdX18: accepted.quoteUsdX18,
    executionPriceUsdX18,
    usdValueX18,
    reason: 'ok',
  };
}
