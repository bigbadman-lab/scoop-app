import { NextResponse } from 'next/server';
import {
  linkNewsArticleMarket,
  resolveArticleFromDraft,
} from '@scoop/db';
import { STOCKNEWS_PROVIDER } from '@scoop/news';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { serverDb } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Body = {
  chainId?: number;
  tokenAddress?: string;
  providerArticleId?: string;
  draftId?: string | null;
};

/**
 * Activate MARKET LIVE after a launch is indexed.
 * Requires an existing `launches` row — never marks pending/failed txs live.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const chainId = body.chainId ?? SCOOP_CHAIN_ID;
  const tokenAddress = typeof body.tokenAddress === 'string' ? body.tokenAddress.trim() : '';
  if (!tokenAddress) {
    return NextResponse.json({ ok: false, error: 'tokenAddress required' }, { status: 400 });
  }

  let provider: string = STOCKNEWS_PROVIDER;
  let providerArticleId =
    typeof body.providerArticleId === 'string' ? body.providerArticleId.trim() : '';
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';

  try {
    if ((!providerArticleId || !provider) && draftId) {
      const fromDraft = await resolveArticleFromDraft(serverDb(), draftId);
      if (fromDraft) {
        provider = fromDraft.provider;
        providerArticleId = fromDraft.providerArticleId;
      }
    }

    if (!providerArticleId) {
      return NextResponse.json(
        { ok: false, error: 'providerArticleId required' },
        { status: 400 },
      );
    }

    const result = await linkNewsArticleMarket(serverDb(), {
      provider,
      providerArticleId,
      chainId,
      tokenAddress,
      draftId: draftId || null,
    });

    if (!result.linked) {
      const status = result.reason === 'launch_not_indexed' ? 409 : 400;
      return NextResponse.json(
        { ok: false, error: result.reason ?? 'link_failed' },
        { status },
      );
    }

    return NextResponse.json(
      { ok: true, providerArticleId, tokenAddress: tokenAddress.toLowerCase() },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    console.error(
      'POST /api/news/article-markets',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
}
