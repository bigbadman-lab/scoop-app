import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';

export type NewsArticleMarketLink = {
  provider: string;
  providerArticleId: string;
  chainId: number;
  tokenAddress: string;
  draftId?: string | null;
};

/**
 * Idempotent article→market link. Requires the token already exists in `launches`
 * (canonical indexed market). Never invents provenance.
 */
export async function linkNewsArticleMarket(
  db: Queryable,
  input: NewsArticleMarketLink,
): Promise<{ linked: boolean; reason?: string }> {
  const provider = input.provider.trim();
  const providerArticleId = input.providerArticleId.trim();
  const tokenAddress = normalizeAddress(input.tokenAddress);
  if (!provider || !providerArticleId || !tokenAddress) {
    return { linked: false, reason: 'invalid_input' };
  }

  const launch = await db.query(
    `SELECT 1 FROM launches WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [input.chainId, tokenAddress],
  );
  if (!launch.rows[0]) {
    return { linked: false, reason: 'launch_not_indexed' };
  }

  const article = await db.query(
    `SELECT 1 FROM provider_news_articles
     WHERE provider = $1 AND provider_article_id = $2 LIMIT 1`,
    [provider, providerArticleId],
  );
  if (!article.rows[0]) {
    return { linked: false, reason: 'article_not_found' };
  }

  await db.query(
    `INSERT INTO news_article_markets (
       provider, provider_article_id, chain_id, token_address, draft_id
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chain_id, token_address) DO NOTHING`,
    [
      provider,
      providerArticleId,
      input.chainId,
      tokenAddress,
      input.draftId?.trim() || null,
    ],
  );

  return { linked: true };
}

/** Resolve article provenance from a news launch draft when present. */
export async function resolveArticleFromDraft(
  db: Queryable,
  draftId: string,
): Promise<{ provider: string; providerArticleId: string } | null> {
  const result = await db.query<{
    provider: string | null;
    provider_article_id: string | null;
    source_type: string;
  }>(
    `SELECT source_type, provider, provider_article_id
     FROM launch_drafts WHERE id = $1 LIMIT 1`,
    [draftId],
  );
  const row = result.rows[0];
  if (!row || row.source_type !== 'news') return null;
  if (!row.provider || !row.provider_article_id) return null;
  return {
    provider: row.provider,
    providerArticleId: row.provider_article_id,
  };
}
