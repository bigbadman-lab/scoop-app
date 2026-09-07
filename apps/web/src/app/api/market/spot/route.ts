import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SpotPayload = {
  ethUsd: number | null;
  btcUsd: number | null;
  asOf: string;
  source: 'coingecko' | 'unavailable';
};

/**
 * Public spot prices for the homepage desk strip.
 * Proxied server-side so the client never depends on CORS / invented values.
 */
export async function GET() {
  const asOf = new Date().toISOString();

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd',
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 30 },
      },
    );

    if (!response.ok) {
      const body: SpotPayload = {
        ethUsd: null,
        btcUsd: null,
        asOf,
        source: 'unavailable',
      };
      return NextResponse.json(body, { status: 200 });
    }

    const data = (await response.json()) as {
      ethereum?: { usd?: number };
      bitcoin?: { usd?: number };
    };

    const ethUsd = typeof data.ethereum?.usd === 'number' ? data.ethereum.usd : null;
    const btcUsd = typeof data.bitcoin?.usd === 'number' ? data.bitcoin.usd : null;

    const body: SpotPayload = {
      ethUsd,
      btcUsd,
      asOf,
      source: ethUsd == null && btcUsd == null ? 'unavailable' : 'coingecko',
    };
    return NextResponse.json(body);
  } catch {
    const body: SpotPayload = {
      ethUsd: null,
      btcUsd: null,
      asOf,
      source: 'unavailable',
    };
    return NextResponse.json(body, { status: 200 });
  }
}
