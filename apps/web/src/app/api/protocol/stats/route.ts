import { NextResponse } from 'next/server';
import { emptyProtocolStats, loadProtocolStatsSafe } from '@/lib/protocol/load-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 20;

/**
 * Near-real-time protocol aggregates for `/protocol/tape`.
 * Includes runtime `tape.contractAddress` from protocol_settings.
 */
export async function GET() {
  try {
    const body = await loadProtocolStatsSafe();
    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40',
      },
    });
  } catch {
    return NextResponse.json(emptyProtocolStats(), { status: 200 });
  }
}
