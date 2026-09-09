/**
 * AggregatorV3-compatible historical round access (Chainlink-style feeds).
 * Used only for explicit historical quote snapshot backfill — not live indexing.
 */

import {
  createPublicClient,
  http,
  parseAbi,
  type PublicClient,
} from 'viem';

export const AGGREGATOR_V3_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
]);

export type AggregatorRound = {
  roundId: bigint;
  /** Phase-local aggregator round index (low 64 bits). */
  aggregatorRound: bigint;
  answer: bigint;
  startedAt: number;
  updatedAt: number;
  answeredInRound: bigint;
};

export type AggregatorV3Reader = {
  decimals: () => Promise<number>;
  latestRoundData: () => Promise<AggregatorRound>;
  getRoundData: (roundId: bigint) => Promise<AggregatorRound>;
};

function packRoundId(phase: bigint, aggregatorRound: bigint): bigint {
  return (phase << 64n) | aggregatorRound;
}

function unpackRoundId(roundId: bigint): { phase: bigint; aggregatorRound: bigint } {
  return {
    phase: roundId >> 64n,
    aggregatorRound: roundId & ((1n << 64n) - 1n),
  };
}

function mapRound(
  roundId: bigint,
  answer: bigint,
  startedAt: bigint,
  updatedAt: bigint,
  answeredInRound: bigint,
): AggregatorRound {
  const { aggregatorRound } = unpackRoundId(roundId);
  return {
    roundId,
    aggregatorRound,
    answer,
    startedAt: Number(startedAt),
    updatedAt: Number(updatedAt),
    answeredInRound,
  };
}

/** Create an RPC-backed AggregatorV3 reader. */
export function createAggregatorV3Reader(args: {
  rpcUrl: string;
  feedAddress: `0x${string}`;
  client?: PublicClient;
}): AggregatorV3Reader {
  const client =
    args.client ??
    createPublicClient({
      transport: http(args.rpcUrl),
    });
  const address = args.feedAddress;

  return {
    async decimals() {
      const d = await client.readContract({
        address,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'decimals',
      });
      return Number(d);
    },
    async latestRoundData() {
      const r = await client.readContract({
        address,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'latestRoundData',
      });
      return mapRound(r[0], r[1], r[2], r[3], r[4]);
    },
    async getRoundData(roundId: bigint) {
      const r = await client.readContract({
        address,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'getRoundData',
        args: [roundId],
      });
      return mapRound(r[0], r[1], r[2], r[3], r[4]);
    },
  };
}

/**
 * Convert feed answer (feed decimals) to price_usd_x18.
 * Rejects non-positive answers.
 */
export function feedAnswerToPriceUsdX18(answer: bigint, feedDecimals: number): bigint {
  if (!Number.isInteger(feedDecimals) || feedDecimals < 0 || feedDecimals > 18) {
    throw new Error(`Invalid feed decimals: ${feedDecimals}`);
  }
  if (answer <= 0n) {
    throw new Error(`Non-positive oracle answer: ${answer.toString()}`);
  }
  return answer * 10n ** BigInt(18 - feedDecimals);
}

/**
 * Deterministic selection: latest AggregatorV3 round with updatedAt <= targetUnixSec.
 * Binary search over phase-local aggregator rounds; bounded by latest round.
 */
export async function findAggregatorRoundAtOrBefore(
  reader: AggregatorV3Reader,
  targetUnixSec: number,
): Promise<AggregatorRound | null> {
  if (!Number.isFinite(targetUnixSec) || targetUnixSec <= 0) {
    throw new Error(`Invalid targetUnixSec: ${targetUnixSec}`);
  }

  const latest = await reader.latestRoundData();
  if (latest.updatedAt <= targetUnixSec) {
    return latest;
  }

  const { phase } = unpackRoundId(latest.roundId);
  let lo = 1n;
  let hi = latest.aggregatorRound;
  let best: AggregatorRound | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1n;
    const round = await reader.getRoundData(packRoundId(phase, mid));
    if (round.updatedAt <= targetUnixSec) {
      best = round;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }

  return best;
}
