import { NextResponse } from 'next/server';
import { getLaunchMarketReady } from '@scoop/db';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseAddress,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Canonical market-ready lookup for launch completion (V2.D).
 * Ready = launches row INNER JOIN tokens (token page / News badge condition).
 * 404 = not indexed yet (not an error of the on-chain launch).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = parseAddress(url.searchParams.get('token') ?? '');
    const chainId = parseChainId(url.searchParams.get('chainId'));
    if (chainId !== SCOOP_CHAIN_ID) {
      throw new ValidationError('Unsupported chainId');
    }

    const launch = await getLaunchMarketReady(serverDb(), chainId, token);
    if (!launch) {
      return NextResponse.json(
        { ready: false, launch: null },
        {
          status: 404,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    const payload = { ready: true as const, launch };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'GET /api/launches/by-token',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
