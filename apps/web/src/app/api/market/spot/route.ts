import { NextResponse } from 'next/server';
import { emptySpotPayload, loadDeskSpot } from '@/lib/market/spot';

/** Short window so client polls stay fresh without blocking upstream on every hit. */
export const revalidate = 20;

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
    return NextResponse.json(emptySpotPayload(), { status: 200 });
  }
}
