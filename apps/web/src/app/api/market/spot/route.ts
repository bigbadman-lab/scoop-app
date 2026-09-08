import { NextResponse } from 'next/server';
import { loadDeskSpot } from '@/lib/market/spot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public desk prices for the homepage strip.
 * Crypto via CoinGecko; equity indices via Yahoo Finance chart meta.
 * Proxied server-side so the client never depends on CORS / invented values.
 */
export async function GET() {
  try {
    const body = await loadDeskSpot();
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      {
        instruments: [
          { id: 'eth', label: 'ETH', price: null, changePct: null },
          { id: 'btc', label: 'BTC', price: null, changePct: null },
          { id: 'spx', label: 'S&P 500', price: null, changePct: null },
          { id: 'ftse', label: 'FTSE 100', price: null, changePct: null },
        ],
        asOf: new Date().toISOString(),
        source: 'unavailable' as const,
      },
      { status: 200 },
    );
  }
}
