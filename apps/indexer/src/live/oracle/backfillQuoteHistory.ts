import type { Queryable } from '@scoop/db';
import { insertQuotePriceSnapshot } from '@scoop/db';
import { normalizeAddress, ZERO_ADDRESS } from '@scoop/shared';
import {
  createAggregatorV3Reader,
  feedAnswerToPriceUsdX18,
  findAggregatorRoundAtOrBefore,
  type AggregatorV3Reader,
} from './aggregatorV3.js';

export type HistoricalQuoteObservation = {
  quoteAsset: string;
  tradeTimestampSec: number;
  observedAtSec: number;
  priceUsdX18: string;
  feedDecimals: number;
  roundId: string;
  aggregatorRound: string;
  answer: string;
  ageSec: number;
  sourceName: 'chainlink_aggregator_v3';
  inserted: boolean;
};

export type BackfillHistoricalQuoteSnapshotsResult = {
  quoteAsset: string;
  feedAddress: string;
  feedDecimals: number;
  observations: HistoricalQuoteObservation[];
  insertedCount: number;
  reusedCount: number;
};

/**
 * For each trade timestamp, ensure a quote_price_snapshots row exists from the
 * configured AggregatorV3 feed's latest round at or before that timestamp.
 * Idempotent: ON CONFLICT DO NOTHING on (chain_id, quote_asset, observed_at).
 *
 * Does not use current ETH/USD for old trades — each observation is the actual
 * historical oracle round updatedAt + answer.
 */
export async function backfillHistoricalQuoteSnapshots(args: {
  db: Queryable;
  chainId: number;
  quoteAsset: string;
  tradeTimestampsSec: number[];
  rpcUrl: string;
  dryRun?: boolean;
  reader?: AggregatorV3Reader;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}): Promise<BackfillHistoricalQuoteSnapshotsResult> {
  const log =
    args.log ??
    ((message: string, fields: Record<string, unknown> = {}) => {
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', message, ...fields }));
    });
  const quoteAsset = normalizeAddress(args.quoteAsset);
  const dryRun = Boolean(args.dryRun);

  const uniqueTs = [...new Set(args.tradeTimestampsSec.filter((t) => Number.isFinite(t) && t > 0))].sort(
    (a, b) => a - b,
  );
  if (uniqueTs.length === 0) {
    return {
      quoteAsset,
      feedAddress: '',
      feedDecimals: 0,
      observations: [],
      insertedCount: 0,
      reusedCount: 0,
    };
  }

  const meta = await args.db.query<{
    oracle_feed: string | null;
    oracle_feed_decimals: number | null;
    oracle_max_age: number | null;
  }>(
    `SELECT oracle_feed, oracle_feed_decimals, oracle_max_age
     FROM quote_assets
     WHERE chain_id = $1 AND quote_asset = $2`,
    [args.chainId, quoteAsset],
  );
  const row = meta.rows[0];
  if (!row) {
    throw new Error(`No quote_assets row for ${quoteAsset}`);
  }
  const feedAddress = row.oracle_feed?.trim();
  if (!feedAddress) {
    throw new Error(`No oracle_feed configured for quote asset ${quoteAsset}`);
  }
  const catalogueDecimals =
    row.oracle_feed_decimals == null ? null : Number(row.oracle_feed_decimals);

  const reader =
    args.reader ??
    createAggregatorV3Reader({
      rpcUrl: args.rpcUrl,
      feedAddress: feedAddress as `0x${string}`,
    });
  const feedDecimals = catalogueDecimals ?? (await reader.decimals());

  /** Deduplicate by oracle observed_at so shared rounds insert once. */
  const byObservedAt = new Map<number, HistoricalQuoteObservation>();

  for (const tradeTimestampSec of uniqueTs) {
    const round = await findAggregatorRoundAtOrBefore(reader, tradeTimestampSec);
    if (!round) {
      throw new Error(
        `No AggregatorV3 round at or before trade timestamp ${tradeTimestampSec} for feed ${feedAddress}`,
      );
    }
    const ageSec = tradeTimestampSec - round.updatedAt;
    if (ageSec < 0) {
      throw new Error('Invariant violated: selected round is after trade timestamp');
    }
    const priceUsdX18 = feedAnswerToPriceUsdX18(round.answer, feedDecimals).toString();
    const existing = byObservedAt.get(round.updatedAt);
    if (existing) {
      // Prefer recording the max age across trades sharing this round in logs later.
      if (ageSec > existing.ageSec) existing.ageSec = ageSec;
      continue;
    }
    byObservedAt.set(round.updatedAt, {
      quoteAsset,
      tradeTimestampSec,
      observedAtSec: round.updatedAt,
      priceUsdX18,
      feedDecimals,
      roundId: round.roundId.toString(),
      aggregatorRound: round.aggregatorRound.toString(),
      answer: round.answer.toString(),
      ageSec,
      sourceName: 'chainlink_aggregator_v3',
      inserted: false,
    });
  }

  let insertedCount = 0;
  let reusedCount = 0;
  const observations: HistoricalQuoteObservation[] = [];

  for (const obs of [...byObservedAt.values()].sort((a, b) => a.observedAtSec - b.observedAtSec)) {
    const prior = await args.db.query<{ price_usd_x18: string }>(
      `SELECT price_usd_x18::text AS price_usd_x18
       FROM quote_price_snapshots
       WHERE chain_id = $1 AND quote_asset = $2 AND observed_at = to_timestamp($3::double precision)
       LIMIT 1`,
      [args.chainId, quoteAsset, obs.observedAtSec],
    );
    if (prior.rows[0]) {
      reusedCount += 1;
      observations.push({ ...obs, inserted: false });
      log('historical quote snapshot already present', {
        quoteAsset,
        observedAtSec: obs.observedAtSec,
        roundId: obs.roundId,
        priceUsdX18: prior.rows[0].price_usd_x18,
      });
      continue;
    }

    if (!dryRun) {
      await insertQuotePriceSnapshot(args.db, {
        chainId: args.chainId,
        quoteAsset,
        priceUsdX18: obs.priceUsdX18,
        sourceBlock: null,
        observedAt: new Date(obs.observedAtSec * 1000),
      });
    }
    insertedCount += 1;
    observations.push({ ...obs, inserted: !dryRun });
    log('historical quote snapshot backfilled', {
      quoteAsset,
      dryRun,
      observedAtSec: obs.observedAtSec,
      observedAtIso: new Date(obs.observedAtSec * 1000).toISOString(),
      roundId: obs.roundId,
      aggregatorRound: obs.aggregatorRound,
      answer: obs.answer,
      feedDecimals,
      priceUsdX18: obs.priceUsdX18,
      sourceName: obs.sourceName,
    });
  }

  return {
    quoteAsset,
    feedAddress,
    feedDecimals,
    observations,
    insertedCount,
    reusedCount,
  };
}

/** Convenience: native ETH quote asset on SCOOP. */
export function isNativeEthQuote(quoteAsset: string): boolean {
  return normalizeAddress(quoteAsset) === ZERO_ADDRESS;
}
