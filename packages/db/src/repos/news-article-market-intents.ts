import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { linkNewsArticleMarket, resolveArticleFromDraft } from './news-article-markets.js';

export type NewsArticleMarketIntentStatus = 'pending' | 'done' | 'failed' | 'expired';

export type NewsArticleMarketIntent = {
  id: string;
  chainId: number;
  tokenAddress: string;
  provider: string;
  providerArticleId: string;
  draftId: string | null;
  status: NewsArticleMarketIntentStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IntentRow = {
  id: string;
  chain_id: string | number;
  token_address: string;
  provider: string;
  provider_article_id: string;
  draft_id: string | null;
  status: NewsArticleMarketIntentStatus;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapIntent(row: IntentRow): NewsArticleMarketIntent {
  return {
    id: row.id,
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    provider: row.provider,
    providerArticleId: row.provider_article_id,
    draftId: row.draft_id,
    status: row.status,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type UpsertNewsArticleMarketIntentInput = {
  chainId: number;
  tokenAddress: string;
  provider?: string | null;
  providerArticleId?: string | null;
  draftId?: string | null;
};

export type UpsertNewsArticleMarketIntentResult =
  | { ok: true; intent: NewsArticleMarketIntent; linked: boolean; reason?: string }
  | { ok: false; reason: string };

/**
 * Persist durable news↔market intent and attempt immediate link when launch is indexed.
 * Idempotent on (chain_id, token_address). Never trusts client headline/URL as identity.
 */
export async function upsertNewsArticleMarketIntentAndLink(
  db: Queryable,
  input: UpsertNewsArticleMarketIntentInput,
): Promise<UpsertNewsArticleMarketIntentResult> {
  const chainId = input.chainId;
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const draftId = input.draftId?.trim() || null;
  let provider = input.provider?.trim() || '';
  let providerArticleId = input.providerArticleId?.trim() || '';

  if (!tokenAddress || !Number.isFinite(chainId)) {
    return { ok: false, reason: 'invalid_input' };
  }

  if (draftId) {
    const fromDraft = await resolveArticleFromDraft(db, draftId);
    if (!fromDraft) {
      return { ok: false, reason: 'invalid_draft' };
    }
    if (providerArticleId && providerArticleId !== fromDraft.providerArticleId) {
      return { ok: false, reason: 'draft_article_mismatch' };
    }
    if (provider && provider !== fromDraft.provider) {
      return { ok: false, reason: 'draft_provider_mismatch' };
    }
    provider = fromDraft.provider;
    providerArticleId = fromDraft.providerArticleId;
  }

  if (!provider || !providerArticleId) {
    return { ok: false, reason: 'provider_article_required' };
  }

  const article = await db.query(
    `SELECT 1 FROM provider_news_articles
     WHERE provider = $1 AND provider_article_id = $2 LIMIT 1`,
    [provider, providerArticleId],
  );
  if (!article.rows[0]) {
    return { ok: false, reason: 'article_not_found' };
  }

  const existingLink = await db.query<{
    provider: string;
    provider_article_id: string;
  }>(
    `SELECT provider, provider_article_id FROM news_article_markets
     WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [chainId, tokenAddress],
  );
  if (existingLink.rows[0]) {
    const row = existingLink.rows[0];
    if (
      row.provider !== provider ||
      row.provider_article_id !== providerArticleId
    ) {
      return { ok: false, reason: 'token_already_linked' };
    }
  }

  const upserted = await db.query<IntentRow>(
    `INSERT INTO news_article_market_intents (
       chain_id, token_address, provider, provider_article_id, draft_id, status, attempts, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'pending', 0, NOW())
     ON CONFLICT (chain_id, token_address) DO UPDATE SET
       provider = EXCLUDED.provider,
       provider_article_id = EXCLUDED.provider_article_id,
       draft_id = COALESCE(EXCLUDED.draft_id, news_article_market_intents.draft_id),
       status = CASE
         WHEN news_article_market_intents.status = 'done' THEN 'done'
         ELSE 'pending'
       END,
       last_error = CASE
         WHEN news_article_market_intents.status = 'done' THEN news_article_market_intents.last_error
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING *`,
    [chainId, tokenAddress, provider, providerArticleId, draftId],
  );
  const intent = mapIntent(upserted.rows[0]!);

  if (intent.status === 'done' || existingLink.rows[0]) {
    if (intent.status !== 'done') {
      await markNewsArticleMarketIntentResult(db, {
        id: intent.id,
        status: 'done',
        lastError: null,
      });
    }
    return {
      ok: true,
      intent: { ...intent, status: 'done' },
      linked: true,
      reason: 'already_linked',
    };
  }

  const link = await linkNewsArticleMarket(db, {
    provider,
    providerArticleId,
    chainId,
    tokenAddress,
    draftId,
  });

  if (link.linked) {
    const done = await markNewsArticleMarketIntentResult(db, {
      id: intent.id,
      status: 'done',
      lastError: null,
    });
    return { ok: true, intent: done ?? intent, linked: true };
  }

  const pending = await bumpNewsArticleMarketIntentAttempt(db, {
    id: intent.id,
    lastError: link.reason ?? 'link_failed',
  });
  return {
    ok: true,
    intent: pending ?? intent,
    linked: false,
    reason: link.reason ?? 'link_failed',
  };
}

export async function listPendingNewsArticleMarketIntents(
  db: Queryable,
  input: { limit?: number; maxAttempts?: number } = {},
): Promise<NewsArticleMarketIntent[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 30, 100));
  const result = await db.query<IntentRow>(
    `SELECT * FROM news_article_market_intents
     WHERE status = 'pending' AND attempts < $1
     ORDER BY updated_at ASC
     LIMIT $2`,
    [maxAttempts, limit],
  );
  return result.rows.map(mapIntent);
}

export async function markNewsArticleMarketIntentResult(
  db: Queryable,
  input: {
    id: string;
    status: NewsArticleMarketIntentStatus;
    lastError: string | null;
  },
): Promise<NewsArticleMarketIntent | null> {
  const result = await db.query<IntentRow>(
    `UPDATE news_article_market_intents
     SET status = $2, last_error = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.id, input.status, input.lastError],
  );
  return result.rows[0] ? mapIntent(result.rows[0]) : null;
}

export async function bumpNewsArticleMarketIntentAttempt(
  db: Queryable,
  input: { id: string; lastError: string },
): Promise<NewsArticleMarketIntent | null> {
  const result = await db.query<IntentRow>(
    `UPDATE news_article_market_intents
     SET attempts = attempts + 1,
         last_error = $2,
         updated_at = NOW(),
         status = CASE
           WHEN attempts + 1 >= 30 THEN 'failed'
           ELSE status
         END
     WHERE id = $1
     RETURNING *`,
    [input.id, input.lastError],
  );
  return result.rows[0] ? mapIntent(result.rows[0]) : null;
}

export async function expireStaleNewsArticleMarketIntents(
  db: Queryable,
  input: { olderThanHours?: number } = {},
): Promise<number> {
  const hours = Math.max(1, Math.min(input.olderThanHours ?? 72, 24 * 30));
  const result = await db.query(
    `UPDATE news_article_market_intents
     SET status = 'expired', updated_at = NOW(), last_error = COALESCE(last_error, 'stale')
     WHERE status = 'pending'
       AND updated_at < NOW() - ($1::text || ' hours')::interval`,
    [String(hours)],
  );
  return result.rowCount ?? 0;
}

export type EnsureNewsFromTrustedDraftResult =
  | { ok: true; skipped: true; reason: 'no_draft' | 'not_news_draft' }
  | {
      ok: true;
      skipped: false;
      linked: boolean;
      intent: NewsArticleMarketIntent;
      reason?: string;
    }
  | { ok: false; reason: string };

/**
 * Trusted display-finalization companion: if `draftId` resolves to a news
 * launch draft, persist canonical news↔market intent/link. Non-news / missing
 * drafts are no-ops. Never trusts client headline/URL as identity.
 */
export async function ensureNewsArticleMarketFromTrustedDraft(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    draftId?: string | null;
  },
): Promise<EnsureNewsFromTrustedDraftResult> {
  const draftId = input.draftId?.trim() || '';
  if (!draftId) {
    return { ok: true, skipped: true, reason: 'no_draft' };
  }

  const resolved = await resolveArticleFromDraft(db, draftId);
  if (!resolved) {
    return { ok: true, skipped: true, reason: 'not_news_draft' };
  }

  const result = await upsertNewsArticleMarketIntentAndLink(db, {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    draftId,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    skipped: false,
    linked: result.linked,
    intent: result.intent,
    reason: result.reason,
  };
}

/**
 * Recovery scan: display intents already `done` with a news draft but no
 * news_article_market_intents row (ZHANG-class gap).
 */
export async function listDoneDisplayIntentsMissingNewsLink(
  db: Queryable,
  input: { lookbackSeconds?: number; limit?: number } = {},
): Promise<
  Array<{
    chainId: number;
    tokenAddress: string;
    draftId: string;
    displayIntentId: string;
  }>
> {
  const lookbackSeconds = input.lookbackSeconds ?? 604_800;
  const limit = input.limit ?? 20;
  const result = await db.query<{
    id: string;
    chain_id: string | number;
    token_address: string;
    draft_id: string;
  }>(
    `SELECT f.id, f.chain_id, f.token_address, f.draft_id
     FROM token_display_finalize_intents f
     INNER JOIN launch_drafts d
       ON d.id = f.draft_id AND d.source_type = 'news'
     WHERE f.status = 'done'
       AND f.draft_id IS NOT NULL
       AND f.token_address IS NOT NULL
       AND f.chain_id IS NOT NULL
       AND f.updated_at >= NOW() - ($1::text || ' seconds')::interval
       AND NOT EXISTS (
         SELECT 1 FROM news_article_market_intents i
         WHERE i.chain_id = f.chain_id
           AND lower(i.token_address) = lower(f.token_address)
       )
     ORDER BY f.updated_at ASC
     LIMIT $2`,
    [String(lookbackSeconds), limit],
  );

  return result.rows.map((row) => ({
    displayIntentId: row.id,
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    draftId: row.draft_id,
  }));
}

/** Originating article for token Lore (durable link only). */
export async function getNewsArticleLoreForToken(
  db: Queryable,
  args: { chainId: number; tokenAddress: string },
): Promise<{
  provider: string;
  providerArticleId: string;
  title: string;
  url: string;
  canonicalUrl: string | null;
  sourceDomain: string;
} | null> {
  const tokenAddress = normalizeAddress(args.tokenAddress);
  const result = await db.query<{
    provider: string;
    provider_article_id: string;
    title: string;
    url: string;
    canonical_url: string | null;
    source_domain: string;
  }>(
    `SELECT nam.provider, nam.provider_article_id,
            a.title, a.url, a.canonical_url, a.source_domain
     FROM news_article_markets nam
     INNER JOIN provider_news_articles a
       ON a.provider = nam.provider AND a.provider_article_id = nam.provider_article_id
     INNER JOIN launches l
       ON l.chain_id = nam.chain_id AND l.token_address = nam.token_address
     WHERE nam.chain_id = $1 AND nam.token_address = $2
     LIMIT 1`,
    [args.chainId, tokenAddress],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    provider: row.provider,
    providerArticleId: row.provider_article_id,
    title: row.title,
    url: row.url,
    canonicalUrl: row.canonical_url,
    sourceDomain: row.source_domain,
  };
}
