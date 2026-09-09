import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import { backfillHistoricalQuoteSnapshots } from './backfillQuoteHistory.js';
import type { AggregatorRound, AggregatorV3Reader } from './aggregatorV3.js';

function round(agg: bigint, updatedAt: number, answer: bigint): AggregatorRound {
  const roundId = (1n << 64n) | agg;
  return {
    roundId,
    aggregatorRound: agg,
    answer,
    startedAt: updatedAt,
    updatedAt,
    answeredInRound: roundId,
  };
}

describe('backfillHistoricalQuoteSnapshots', () => {
  it('inserts distinct at-or-before rounds and is idempotent on second pass', async () => {
    const rounds = [
      round(1n, 500, 1900_00000000n),
      round(2n, 1000, 2000_00000000n),
      round(3n, 2000, 2100_00000000n),
      round(4n, 3000, 2200_00000000n),
    ];
    const byAgg = new Map(rounds.map((r) => [r.aggregatorRound, r]));
    const reader: AggregatorV3Reader = {
      decimals: async () => 8,
      latestRoundData: async () => rounds[3]!,
      getRoundData: async (id) => {
        const agg = id & ((1n << 64n) - 1n);
        const hit = byAgg.get(agg);
        if (!hit) throw new Error(`missing ${agg}`);
        return hit;
      },
    };

    const existing = new Set<number>();
    const inserted: Array<{ observedAt: Date; price: string }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM quote_assets')) {
        return {
          rows: [
            {
              oracle_feed: '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9',
              oracle_feed_decimals: 8,
              oracle_max_age: 86400,
            },
          ],
        };
      }
      if (sql.includes('SELECT price_usd_x18') && sql.includes('quote_price_snapshots')) {
        const ts = Number(params?.[2]);
        if (existing.has(ts)) {
          return { rows: [{ price_usd_x18: '1' }] };
        }
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO quote_price_snapshots')) {
        const observedAt = params?.[4] as Date;
        const sec = Math.floor(observedAt.getTime() / 1000);
        existing.add(sec);
        inserted.push({ observedAt, price: String(params?.[2]) });
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await backfillHistoricalQuoteSnapshots({
      db: { query } as never,
      chainId: 4663,
      quoteAsset: ZERO_ADDRESS,
      tradeTimestampsSec: [1500, 2500, 2501],
      rpcUrl: 'http://unused',
      reader,
      log: () => undefined,
    });

    expect(first.insertedCount).toBe(2); // rounds at 1000 and 2000
    expect(first.reusedCount).toBe(0);
    expect(inserted).toHaveLength(2);
    expect(first.observations.map((o) => o.observedAtSec).sort()).toEqual([1000, 2000]);
    expect(first.observations[0]?.sourceName).toBe('chainlink_aggregator_v3');

    const second = await backfillHistoricalQuoteSnapshots({
      db: { query } as never,
      chainId: 4663,
      quoteAsset: ZERO_ADDRESS,
      tradeTimestampsSec: [1500, 2500],
      rpcUrl: 'http://unused',
      reader,
      log: () => undefined,
    });
    expect(second.insertedCount).toBe(0);
    expect(second.reusedCount).toBe(2);
    expect(inserted).toHaveLength(2);
  });

  it('dry-run does not insert', async () => {
    const rounds = [round(1n, 1000, 2000_00000000n), round(2n, 5000, 2100_00000000n)];
    const byAgg = new Map(rounds.map((r) => [r.aggregatorRound, r]));
    const reader: AggregatorV3Reader = {
      decimals: async () => 8,
      latestRoundData: async () => rounds[1]!,
      getRoundData: async (id) => byAgg.get(id & ((1n << 64n) - 1n))!,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM quote_assets')) {
        return {
          rows: [
            {
              oracle_feed: '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9',
              oracle_feed_decimals: 8,
              oracle_max_age: 86400,
            },
          ],
        };
      }
      if (sql.includes('SELECT price_usd_x18')) return { rows: [] };
      if (sql.includes('INSERT')) throw new Error('should not insert in dry-run');
      return { rows: [] };
    });

    const result = await backfillHistoricalQuoteSnapshots({
      db: { query } as never,
      chainId: 4663,
      quoteAsset: ZERO_ADDRESS,
      tradeTimestampsSec: [1500],
      rpcUrl: 'http://unused',
      reader,
      dryRun: true,
      log: () => undefined,
    });
    expect(result.insertedCount).toBe(1);
    expect(result.observations[0]?.inserted).toBe(false);
  });
});
