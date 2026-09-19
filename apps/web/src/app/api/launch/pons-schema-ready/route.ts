import { NextResponse } from 'next/server';
import { checkPonsMarketSchemaReady } from '@scoop/db';
import { serverDb } from '@/lib/server/queries';
import { assertNoSecretLeakage } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

/**
 * Gate 7 fail-closed schema readiness for public Pons launches.
 * Ready only when launches.market_source + curve_address exist (Gate 6 migration).
 */
export async function GET() {
  try {
    const readiness = await checkPonsMarketSchemaReady(serverDb());
    const payload = {
      ready: readiness.ready,
      reason: readiness.reason,
      hasMarketSource: readiness.hasMarketSource,
      hasCurveAddress: readiness.hasCurveAddress,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, {
      status: readiness.ready ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error(
      'GET /api/launch/pons-schema-ready',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json(
      {
        ready: false,
        reason: 'BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY',
        hasMarketSource: false,
        hasCurveAddress: false,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
