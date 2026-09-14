import { NextResponse } from 'next/server';
import { upsertNewsArticleMarketIntentAndLink } from '@scoop/db';
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
  provider?: string;
};

/**
 * Durable news↔market bind.
 * Upserts a server-owned intent and links immediately when the launch is indexed.
 * Browser abort must not prevent later cron reconciliation.
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

  const provider =
    typeof body.provider === 'string' && body.provider.trim()
      ? body.provider.trim()
      : STOCKNEWS_PROVIDER;
  const providerArticleId =
    typeof body.providerArticleId === 'string' ? body.providerArticleId.trim() : '';
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';

  if (!providerArticleId && !draftId) {
    return NextResponse.json(
      { ok: false, error: 'providerArticleId required' },
      { status: 400 },
    );
  }

  try {
    const result = await upsertNewsArticleMarketIntentAndLink(serverDb(), {
      chainId,
      tokenAddress,
      provider,
      providerArticleId: providerArticleId || null,
      draftId: draftId || null,
    });

    if (!result.ok) {
      const status =
        result.reason === 'token_already_linked'
          ? 409
          : result.reason === 'article_not_found' ||
              result.reason === 'invalid_draft' ||
              result.reason === 'draft_article_mismatch' ||
              result.reason === 'draft_provider_mismatch'
            ? 400
            : 400;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }

    // Intent is durable even when launch is not indexed yet.
    return NextResponse.json(
      {
        ok: true,
        linked: result.linked,
        pending: !result.linked,
        providerArticleId: result.intent.providerArticleId,
        tokenAddress: result.intent.tokenAddress,
        intentStatus: result.intent.status,
        reason: result.reason ?? null,
      },
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
