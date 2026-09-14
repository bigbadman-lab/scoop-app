import { NextResponse } from 'next/server';
import { loadProtocolStatsSafe } from '@/lib/protocol/load-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 20;

/**
 * Near-real-time protocol aggregates for `/protocol/tape`.
 * Backed by indexed production data (fixed-lag indexer).
 */
export async function GET() {
  try {
    const body = await loadProtocolStatsSafe();
    const status = body.status === 'ok' ? 200 : 200;
    return NextResponse.json(body, {
      status,
      headers: {
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40',
      },
    });
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        updatedAt: new Date().toISOString(),
        marketsLaunched: 0,
        totalTrades: 0,
        totalVolumeUsd: null,
        totalFeesUsd: null,
        protocolBuybackFeesUsd: null,
        feeSemantics: 'distributed_marked_to_market',
        feeCoverage: 'unavailable',
        tradesMissingUsd: 0,
        message: 'Protocol stats temporarily unavailable',
      },
      { status: 200 },
    );
  }
}
