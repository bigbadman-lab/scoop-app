import type { PublicClient } from 'viem';
import type { Queryable } from '@scoop/db';
import {
  insertQuotePriceSnapshot,
  listSnapshotEligibleQuoteAssets,
  upsertIndexerHealth,
} from '@scoop/db';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import type { HexAddress } from '@scoop/shared';

export type QuoteSnapshotAssetResult = {
  quoteAsset: string;
  symbol: string;
  ok: boolean;
  priceUsdX18?: bigint;
  error?: string;
};

/**
 * Periodic quote/USD snapshots via ScoopPriceOracle.getPriceUsd for every
 * enabled catalogue asset with a configured oracle feed.
 * Per-asset failures are skipped — core indexing must not fail.
 */
export async function maybeSnapshotQuoteUsd(args: {
  db: Queryable;
  client: PublicClient;
  chainId: number;
  intervalSeconds: number;
  lastSnapshotAtMs: number;
  nowMs?: number;
}): Promise<{
  snapped: boolean;
  nextLastAtMs: number;
  results: QuoteSnapshotAssetResult[];
  priceUsdX18?: bigint;
}> {
  const now = args.nowMs ?? Date.now();
  if (now - args.lastSnapshotAtMs < args.intervalSeconds * 1000) {
    return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs, results: [] };
  }

  let assets: Awaited<ReturnType<typeof listSnapshotEligibleQuoteAssets>> = [];
  try {
    assets = await listSnapshotEligibleQuoteAssets(args.db, args.chainId);
  } catch {
    return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs, results: [] };
  }

  if (assets.length === 0) {
    return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs, results: [] };
  }

  const oracle = scoopV1MainnetCanaryManifest.contracts.ScoopPriceOracle;
  const results: QuoteSnapshotAssetResult[] = [];
  let anyOk = false;
  let ethPrice: bigint | undefined;

  for (const asset of assets) {
    try {
      const price = (await args.client.readContract({
        address: oracle,
        abi: scoopAbis.ScoopPriceOracle,
        functionName: 'getPriceUsd',
        args: [asset.quoteAsset as HexAddress],
      })) as bigint;

      if (price <= 0n) {
        results.push({
          quoteAsset: asset.quoteAsset,
          symbol: asset.symbol,
          ok: false,
          error: 'non_positive',
        });
        continue;
      }

      await args.db.query('SAVEPOINT quote_usd_snapshot');
      try {
        await insertQuotePriceSnapshot(args.db, {
          chainId: args.chainId,
          quoteAsset: asset.quoteAsset,
          priceUsdX18: price,
        });
        await args.db.query('RELEASE SAVEPOINT quote_usd_snapshot');
        results.push({
          quoteAsset: asset.quoteAsset,
          symbol: asset.symbol,
          ok: true,
          priceUsdX18: price,
        });
        anyOk = true;
        if (asset.quoteAsset === '0x0000000000000000000000000000000000000000') {
          ethPrice = price;
        }
      } catch (err) {
        await args.db.query('ROLLBACK TO SAVEPOINT quote_usd_snapshot');
        results.push({
          quoteAsset: asset.quoteAsset,
          symbol: asset.symbol,
          ok: false,
          error: err instanceof Error ? err.message : 'insert_failed',
        });
      }
    } catch (err) {
      results.push({
        quoteAsset: asset.quoteAsset,
        symbol: asset.symbol,
        ok: false,
        error: err instanceof Error ? err.message : 'oracle_failed',
      });
    }
  }

  if (anyOk) {
    try {
      await upsertIndexerHealth(args.db, {
        chainId: args.chainId,
        lastQuoteUsdAt: new Date(now),
      });
    } catch {
      // health update is best-effort
    }
    return {
      snapped: true,
      nextLastAtMs: now,
      results,
      priceUsdX18: ethPrice,
    };
  }

  return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs, results };
}
