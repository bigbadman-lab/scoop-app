import type { PublicClient } from 'viem';
import type { Queryable } from '@scoop/db';
import { insertQuotePriceSnapshot, upsertIndexerHealth } from '@scoop/db';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import { ZERO_ADDRESS } from '@scoop/shared';

/**
 * Periodic ETH/USD snapshot via ScoopPriceOracle.getPriceUsd.
 * Failures are skipped — core indexing must not fail.
 */
export async function maybeSnapshotQuoteUsd(args: {
  db: Queryable;
  client: PublicClient;
  chainId: number;
  intervalSeconds: number;
  lastSnapshotAtMs: number;
  nowMs?: number;
}): Promise<{ snapped: boolean; nextLastAtMs: number; priceUsdX18?: bigint }> {
  const now = args.nowMs ?? Date.now();
  if (now - args.lastSnapshotAtMs < args.intervalSeconds * 1000) {
    return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs };
  }

  try {
    const oracle = scoopV1MainnetCanaryManifest.contracts.ScoopPriceOracle;
    const price = (await args.client.readContract({
      address: oracle,
      abi: scoopAbis.ScoopPriceOracle,
      functionName: 'getPriceUsd',
      args: [ZERO_ADDRESS],
    })) as bigint;

    // SAVEPOINT: snapshot insert must not abort the outer indexer transaction
    await args.db.query('SAVEPOINT quote_usd_snapshot');
    try {
      await insertQuotePriceSnapshot(args.db, {
        chainId: args.chainId,
        quoteAsset: ZERO_ADDRESS,
        priceUsdX18: price,
      });
      await upsertIndexerHealth(args.db, {
        chainId: args.chainId,
        lastQuoteUsdAt: new Date(now),
      });
      await args.db.query('RELEASE SAVEPOINT quote_usd_snapshot');
      return { snapped: true, nextLastAtMs: now, priceUsdX18: price };
    } catch {
      await args.db.query('ROLLBACK TO SAVEPOINT quote_usd_snapshot');
      return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs };
    }
  } catch {
    return { snapped: false, nextLastAtMs: args.lastSnapshotAtMs };
  }
}
