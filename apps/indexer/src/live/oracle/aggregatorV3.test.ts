import { describe, expect, it } from 'vitest';
import {
  feedAnswerToPriceUsdX18,
  findAggregatorRoundAtOrBefore,
  type AggregatorRound,
  type AggregatorV3Reader,
} from './aggregatorV3.js';

function round(partial: Partial<AggregatorRound> & Pick<AggregatorRound, 'aggregatorRound' | 'updatedAt' | 'answer'>): AggregatorRound {
  const aggregatorRound = partial.aggregatorRound;
  const roundId = (1n << 64n) | aggregatorRound;
  return {
    roundId,
    aggregatorRound,
    answer: partial.answer,
    startedAt: partial.startedAt ?? partial.updatedAt,
    updatedAt: partial.updatedAt,
    answeredInRound: partial.answeredInRound ?? roundId,
  };
}

function mockReader(rounds: AggregatorRound[]): AggregatorV3Reader {
  const byAgg = new Map(rounds.map((r) => [r.aggregatorRound, r]));
  const latest = rounds[rounds.length - 1]!;
  return {
    decimals: async () => 8,
    latestRoundData: async () => latest,
    getRoundData: async (roundId: bigint) => {
      const agg = roundId & ((1n << 64n) - 1n);
      const hit = byAgg.get(agg);
      if (!hit) throw new Error(`missing round ${agg.toString()}`);
      return hit;
    },
  };
}

describe('feedAnswerToPriceUsdX18', () => {
  it('scales 8-decimal feed answer to x18', () => {
    expect(feedAnswerToPriceUsdX18(248929759576n, 8)).toBe(2489297595760000000000n);
  });

  it('rejects non-positive answers', () => {
    expect(() => feedAnswerToPriceUsdX18(0n, 8)).toThrow(/Non-positive/);
  });
});

describe('findAggregatorRoundAtOrBefore', () => {
  const rounds = [
    round({ aggregatorRound: 1n, updatedAt: 1000, answer: 100n }),
    round({ aggregatorRound: 2n, updatedAt: 2000, answer: 200n }),
    round({ aggregatorRound: 3n, updatedAt: 3000, answer: 300n }),
    round({ aggregatorRound: 4n, updatedAt: 4000, answer: 400n }),
  ];

  it('selects latest round at or before target', async () => {
    const reader = mockReader(rounds);
    const hit = await findAggregatorRoundAtOrBefore(reader, 3500);
    expect(hit?.aggregatorRound).toBe(3n);
    expect(hit?.updatedAt).toBe(3000);
    expect(hit?.answer).toBe(300n);
  });

  it('returns exact match when target equals updatedAt', async () => {
    const reader = mockReader(rounds);
    const hit = await findAggregatorRoundAtOrBefore(reader, 2000);
    expect(hit?.aggregatorRound).toBe(2n);
  });

  it('returns null when all rounds are after target', async () => {
    const reader = mockReader(rounds);
    const hit = await findAggregatorRoundAtOrBefore(reader, 500);
    expect(hit).toBeNull();
  });

  it('returns latest when target is at or after latest', async () => {
    const reader = mockReader(rounds);
    const hit = await findAggregatorRoundAtOrBefore(reader, 9999);
    expect(hit?.aggregatorRound).toBe(4n);
  });
});
