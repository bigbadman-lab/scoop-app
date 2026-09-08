import type { Queryable } from '@scoop/db';
import {
  listMarketsForQuoteUsdRevaluation,
  updateTokenMarketUsdValuation,
} from '@scoop/db';
import {
  fdvUsdX18FromPrice,
  normalizeAddress,
  priceUsdX18FromQuote,
} from '@scoop/shared';

export type RevalueMarketResult = {
  tokenAddress: string;
  ok: boolean;
  skipped?: 'null_price_quote' | 'non_positive_quote_usd';
  error?: string;
  priceUsdX18?: bigint;
  fdvUsdX18?: bigint;
};

export type RevalueMarketsForQuoteResult = {
  quoteAsset: string;
  marketsSeen: number;
  updated: number;
  skipped: number;
  failed: number;
  results: RevalueMarketResult[];
};

/**
 * After a fresh quote/USD snapshot, revalue all markets paired with that quote.
 * Derives USD price/FDV from existing price_quote_x18 — no trade required.
 * Does not mutate volume, last_trade_at, or other trade metrics.
 */
export async function revalueMarketsForQuote(
  db: Queryable,
  args: {
    chainId: number;
    quoteAsset: string;
    quoteUsdX18: bigint;
    log?: (message: string, err?: unknown) => void;
  },
): Promise<RevalueMarketsForQuoteResult> {
  const quoteAsset = normalizeAddress(args.quoteAsset);
  const log =
    args.log ??
    ((msg: string, err?: unknown) =>
      console.warn(`[revalueMarketsForQuote] ${msg}`, err ?? ''));

  if (args.quoteUsdX18 <= 0n) {
    return {
      quoteAsset,
      marketsSeen: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  let markets: Awaited<ReturnType<typeof listMarketsForQuoteUsdRevaluation>> = [];
  try {
    markets = await listMarketsForQuoteUsdRevaluation(db, args.chainId, quoteAsset);
  } catch (err) {
    log(`list markets failed for ${quoteAsset}`, err);
    return {
      quoteAsset,
      marketsSeen: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      results: [
        {
          tokenAddress: '',
          ok: false,
          error: err instanceof Error ? err.message : 'list_failed',
        },
      ],
    };
  }

  const results: RevalueMarketResult[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const market of markets) {
    try {
      const priceQuoteX18 = BigInt(market.priceQuoteX18);
      if (priceQuoteX18 < 0n) {
        skipped += 1;
        results.push({
          tokenAddress: market.tokenAddress,
          ok: false,
          skipped: 'null_price_quote',
        });
        continue;
      }

      const priceUsdX18 = priceUsdX18FromQuote({
        priceQuoteX18,
        quoteUsdX18: args.quoteUsdX18,
      });
      const fdvUsdX18 = fdvUsdX18FromPrice({
        priceUsdX18,
        totalSupplyRaw: BigInt(market.totalSupplyRaw),
        tokenDecimals: market.tokenDecimals,
      });

      await updateTokenMarketUsdValuation(db, {
        chainId: args.chainId,
        tokenAddress: market.tokenAddress,
        quoteUsdX18: args.quoteUsdX18,
        priceUsdX18,
        fdvUsdX18,
      });

      updated += 1;
      results.push({
        tokenAddress: market.tokenAddress,
        ok: true,
        priceUsdX18,
        fdvUsdX18,
      });
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : 'revalue_failed';
      log(`market ${market.tokenAddress} failed: ${message}`, err);
      results.push({
        tokenAddress: market.tokenAddress,
        ok: false,
        error: message,
      });
    }
  }

  return {
    quoteAsset,
    marketsSeen: markets.length,
    updated,
    skipped,
    failed,
    results,
  };
}
