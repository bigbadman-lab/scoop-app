import { NextResponse } from 'next/server';
import { listNewsArticleMarkets } from '@scoop/db';
import { STOCKNEWS_PROVIDER } from '@scoop/news';
import { serverDb } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ providerArticleId: string }> };

/** On-demand full market list for multi-market News selector. */
export async function GET(_request: Request, { params }: Params) {
  const { providerArticleId: raw } = await params;
  const providerArticleId = decodeURIComponent(raw ?? '').trim();
  if (!providerArticleId) {
    return NextResponse.json({ items: [] }, { status: 400 });
  }

  try {
    const rows = await listNewsArticleMarkets(serverDb(), {
      provider: STOCKNEWS_PROVIDER,
      providerArticleId,
    });
    return NextResponse.json(
      {
        providerArticleId,
        items: rows.map((m) => ({
          chainId: m.chainId,
          tokenAddress: m.tokenAddress,
          symbol: m.symbol,
          name: m.name,
          quoteAsset: m.quoteAsset,
          launchedAt: m.launchedAt,
          ageSeconds: m.ageSeconds,
          priceUsdDisplay: m.priceUsdDisplay,
          fdvUsdDisplay: m.fdvUsdDisplay,
          volume24hUsdDisplay: m.volume24hUsdDisplay,
        })),
      },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    console.error(
      'GET /api/news/.../markets',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ providerArticleId, items: [] }, { status: 503 });
  }
}
