import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import { buildPublicTokenImageUrl } from './live-overlay.js';
import { ensureNewsArticleMarketFromTrustedDraft } from './news-article-market-intents.js';
import { setTokenDisplayImageUrl } from './tokens.js';

export type TokenDisplayFinalizeIntentStatus =
  | 'awaiting_token'
  | 'pending'
  | 'done'
  | 'failed'
  | 'expired'
  | 'noop';

export type TokenDisplayFinalizeIntent = {
  id: string;
  chainId: number | null;
  tokenAddress: string | null;
  draftId: string | null;
  displayImagePath: string | null;
  imageUri: string;
  status: TokenDisplayFinalizeIntentStatus;
  attempts: number;
  lastError: string | null;
};

export type UpsertDisplayFinalizeIntentInput = {
  imageUri: string;
  draftId?: string | null;
  displayImagePath?: string | null;
  chainId?: number | null;
  tokenAddress?: string | null;
};

type IntentRow = {
  id: string;
  chain_id: number | null;
  token_address: string | null;
  draft_id: string | null;
  display_image_path: string | null;
  image_uri: string;
  status: TokenDisplayFinalizeIntentStatus;
  attempts: number;
  last_error: string | null;
};

function mapRow(row: IntentRow): TokenDisplayFinalizeIntent {
  return {
    id: row.id,
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    draftId: row.draft_id,
    displayImagePath: row.display_image_path,
    imageUri: row.image_uri,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

function normalizeImageUri(imageUri: string): string {
  return imageUri.trim();
}

/**
 * Upsert a pin-time / post-receipt finalize intent.
 * When token is known → pending; otherwise awaiting_token matched by image_uri.
 *
 * Critical: when a token address arrives, bind the existing awaiting_token row
 * for this image_uri instead of inserting a duplicate open intent.
 */
export async function upsertTokenDisplayFinalizeIntent(
  db: Queryable,
  input: UpsertDisplayFinalizeIntentInput,
): Promise<TokenDisplayFinalizeIntent | null> {
  const imageUri = normalizeImageUri(input.imageUri);
  if (!imageUri || !/^ipfs:\/\//i.test(imageUri)) {
    return null;
  }
  const draftId = input.draftId?.trim() || null;
  const displayImagePath =
    input.displayImagePath?.trim().replace(/^\/+/, '') || null;
  const tokenAddress = input.tokenAddress
    ? normalizeAddress(input.tokenAddress)
    : null;
  const chainId =
    typeof input.chainId === 'number' && Number.isInteger(input.chainId)
      ? input.chainId
      : null;
  const status: TokenDisplayFinalizeIntentStatus =
    chainId != null && tokenAddress ? 'pending' : 'awaiting_token';

  if (tokenAddress && chainId != null) {
    const boundAwaiting = await db.query<IntentRow>(
      `UPDATE token_display_finalize_intents
       SET chain_id = $2,
           token_address = $3,
           draft_id = COALESCE($4, draft_id),
           display_image_path = COALESCE($5, display_image_path),
           status = 'pending',
           updated_at = NOW()
       WHERE id = (
         SELECT id FROM token_display_finalize_intents
         WHERE image_uri = $1
           AND status = 'awaiting_token'
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING *`,
      [imageUri, chainId, tokenAddress, draftId, displayImagePath],
    );
    if (boundAwaiting.rows[0]) {
      return mapRow(boundAwaiting.rows[0]);
    }

    const result = await db.query<IntentRow>(
      `INSERT INTO token_display_finalize_intents (
         chain_id, token_address, draft_id, display_image_path, image_uri, status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chain_id, token_address)
         WHERE token_address IS NOT NULL AND status IN ('awaiting_token', 'pending')
       DO UPDATE SET
         draft_id = COALESCE(EXCLUDED.draft_id, token_display_finalize_intents.draft_id),
         display_image_path = COALESCE(
           EXCLUDED.display_image_path,
           token_display_finalize_intents.display_image_path
         ),
         image_uri = EXCLUDED.image_uri,
         status = 'pending',
         updated_at = NOW()
       RETURNING *`,
      [chainId, tokenAddress, draftId, displayImagePath, imageUri, status],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  // Prefer updating an open awaiting intent for the same image_uri.
  const existing = await db.query<IntentRow>(
    `SELECT * FROM token_display_finalize_intents
     WHERE image_uri = $1
       AND status IN ('awaiting_token', 'pending')
     ORDER BY created_at DESC
     LIMIT 1`,
    [imageUri],
  );
  if (existing.rows[0]) {
    const result = await db.query<IntentRow>(
      `UPDATE token_display_finalize_intents
       SET draft_id = COALESCE($2, draft_id),
           display_image_path = COALESCE($3, display_image_path),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [existing.rows[0].id, draftId, displayImagePath],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  const inserted = await db.query<IntentRow>(
    `INSERT INTO token_display_finalize_intents (
       draft_id, display_image_path, image_uri, status
     ) VALUES ($1, $2, $3, 'awaiting_token')
     RETURNING *`,
    [draftId, displayImagePath, imageUri],
  );
  return inserted.rows[0] ? mapRow(inserted.rows[0]) : null;
}

function isTrustedDisplayImagePath(path: string): boolean {
  const trimmed = path.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return false;
  return /^(drafts|manual|canonical)\//.test(trimmed);
}

export type BindDisplayFinalizeIntentInput = {
  chainId: number;
  tokenAddress: string;
  imageUri: string;
  draftId?: string | null;
  displayImagePath?: string | null;
};

/**
 * Receipt-side bind: attach token address to an existing trusted finalize intent.
 * Does not create intents — pin/enqueue owns creation. Returns null when no
 * open intent exists for the image_uri (prevents arbitrary path injection).
 */
export async function bindDisplayFinalizeIntentToToken(
  db: Queryable,
  input: BindDisplayFinalizeIntentInput,
): Promise<TokenDisplayFinalizeIntent | null> {
  const imageUri = normalizeImageUri(input.imageUri);
  if (!imageUri || !/^ipfs:\/\//i.test(imageUri)) {
    return null;
  }
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const draftId = input.draftId?.trim() || null;
  const displayImagePath =
    input.displayImagePath?.trim().replace(/^\/+/, '') || null;
  if (displayImagePath && !isTrustedDisplayImagePath(displayImagePath)) {
    return null;
  }

  // Prefer binding an awaiting_token intent for this image_uri.
  const boundAwaiting = await db.query<IntentRow>(
    `UPDATE token_display_finalize_intents
     SET chain_id = $2,
         token_address = $3,
         draft_id = COALESCE($4, draft_id),
         display_image_path = COALESCE($5, display_image_path),
         status = 'pending',
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM token_display_finalize_intents
       WHERE image_uri = $1
         AND status = 'awaiting_token'
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING *`,
    [imageUri, input.chainId, tokenAddress, draftId, displayImagePath],
  );
  if (boundAwaiting.rows[0]) {
    return mapRow(boundAwaiting.rows[0]);
  }

  // Already pending/done for this token + image_uri.
  const existingForToken = await db.query<IntentRow>(
    `SELECT * FROM token_display_finalize_intents
     WHERE chain_id = $1
       AND token_address = $2
       AND image_uri = $3
       AND status IN ('pending', 'done')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.chainId, tokenAddress, imageUri],
  );
  if (existingForToken.rows[0]) {
    if (draftId || displayImagePath) {
      const updated = await db.query<IntentRow>(
        `UPDATE token_display_finalize_intents
         SET draft_id = COALESCE($2, draft_id),
             display_image_path = COALESCE($3, display_image_path),
             status = CASE WHEN status = 'done' THEN 'done' ELSE 'pending' END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existingForToken.rows[0].id, draftId, displayImagePath],
      );
      return updated.rows[0] ? mapRow(updated.rows[0]) : mapRow(existingForToken.rows[0]);
    }
    return mapRow(existingForToken.rows[0]);
  }

  // Open pending for same image_uri (e.g. prior bind without row) — re-bind.
  const openByUri = await db.query<IntentRow>(
    `UPDATE token_display_finalize_intents
     SET chain_id = $2,
         token_address = $3,
         draft_id = COALESCE($4, draft_id),
         display_image_path = COALESCE($5, display_image_path),
         status = 'pending',
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM token_display_finalize_intents
       WHERE image_uri = $1
         AND status = 'pending'
       ORDER BY updated_at DESC
       LIMIT 1
     )
     RETURNING *`,
    [imageUri, input.chainId, tokenAddress, draftId, displayImagePath],
  );
  if (openByUri.rows[0]) {
    return mapRow(openByUri.rows[0]);
  }

  return null;
}

export type ApplyBoundDisplayImageResult = {
  applied: boolean;
  skipped: boolean;
  displayImageUrl: string | null;
  intentId: string | null;
  intentFound: boolean;
  pathFound: boolean;
};

/**
 * Canonical insert enrichment: if a bound/awaiting intent already has a trusted
 * display path for this token's image_uri, set tokens.display_image_url and
 * mark the intent done. When the intent carries a news `draft_id`, also persist
 * the canonical news↔market relationship (ZHANG durability invariant).
 */
export async function applyBoundDisplayImageOnTokenInsert(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    imageUri: string;
    supabaseUrl?: string | null;
  },
): Promise<ApplyBoundDisplayImageResult> {
  const imageUri = normalizeImageUri(input.imageUri);
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const empty: ApplyBoundDisplayImageResult = {
    applied: false,
    skipped: false,
    displayImageUrl: null,
    intentId: null,
    intentFound: false,
    pathFound: false,
  };
  if (!imageUri || !/^ipfs:\/\//i.test(imageUri)) {
    return empty;
  }

  const intentResult = await db.query<IntentRow>(
    `SELECT * FROM token_display_finalize_intents
     WHERE display_image_path IS NOT NULL
       AND TRIM(display_image_path) <> ''
       AND (
         (chain_id = $1 AND token_address = $2 AND status IN ('pending', 'awaiting_token', 'done'))
         OR (image_uri = $3 AND status IN ('awaiting_token', 'pending'))
       )
     ORDER BY
       CASE WHEN chain_id = $1 AND token_address = $2 THEN 0 ELSE 1 END,
       CASE status
         WHEN 'pending' THEN 0
         WHEN 'awaiting_token' THEN 1
         WHEN 'done' THEN 2
         ELSE 3
       END,
       updated_at DESC
     LIMIT 1`,
    [input.chainId, tokenAddress, imageUri],
  );
  const intent = intentResult.rows[0] ? mapRow(intentResult.rows[0]) : null;
  if (!intent) {
    return empty;
  }
  const path = intent.displayImagePath?.trim().replace(/^\/+/, '') || '';
  if (!path || !isTrustedDisplayImagePath(path)) {
    return { ...empty, intentFound: true, intentId: intent.id, pathFound: false };
  }

  const displayImageUrl = buildPublicTokenImageUrl(path, input.supabaseUrl);
  if (!displayImageUrl) {
    return { ...empty, intentFound: true, intentId: intent.id, pathFound: true };
  }

  const write = await setTokenDisplayImageUrl(db, {
    chainId: input.chainId,
    tokenAddress,
    displayImageUrl,
  });

  await db.query(
    `UPDATE token_display_finalize_intents
     SET chain_id = $2,
         token_address = $3,
         status = 'done',
         updated_at = NOW()
     WHERE id = $1
       AND status IN ('awaiting_token', 'pending', 'done')`,
    [intent.id, input.chainId, tokenAddress],
  );

  // News lore durability: indexer display success must not leave ZHANG-class gap.
  await ensureNewsArticleMarketFromTrustedDraft(db, {
    chainId: input.chainId,
    tokenAddress,
    draftId: intent.draftId,
  });

  return {
    applied: write === 'applied',
    skipped: write === 'skipped',
    displayImageUrl,
    intentId: intent.id,
    intentFound: true,
    pathFound: true,
  };
}

/**
 * Bind awaiting_token intents to a unique indexed token sharing image_uri.
 * Skips ambiguous matches (2+ tokens).
 */
export async function bindAwaitingDisplayFinalizeIntents(
  db: Queryable,
  input: { lookbackSeconds?: number; limit?: number } = {},
): Promise<{ bound: number; ambiguous: number }> {
  const lookbackSeconds = input.lookbackSeconds ?? 172_800;
  const limit = input.limit ?? 40;
  const awaiting = await db.query<IntentRow>(
    `SELECT * FROM token_display_finalize_intents
     WHERE status = 'awaiting_token'
       AND created_at >= NOW() - ($1::text || ' seconds')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [String(lookbackSeconds), limit],
  );

  let bound = 0;
  let ambiguous = 0;
  for (const row of awaiting.rows) {
    const matches = await db.query<{
      chain_id: number;
      token_address: string;
    }>(
      `SELECT t.chain_id, t.token_address
       FROM tokens t
       INNER JOIN launches l
         ON l.chain_id = t.chain_id AND l.token_address = t.token_address
       WHERE t.image_uri = $1
         AND (t.display_image_url IS NULL OR TRIM(t.display_image_url) = '')
         AND l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2)
       LIMIT 3`,
      [row.image_uri, lookbackSeconds],
    );
    if (matches.rows.length === 0) continue;
    if (matches.rows.length > 1) {
      ambiguous += 1;
      continue;
    }
    const match = matches.rows[0]!;
    const tokenAddress = normalizeAddress(match.token_address);
    const existingOpen = await db.query<{ id: string }>(
      `SELECT id FROM token_display_finalize_intents
       WHERE chain_id = $1 AND token_address = $2
         AND status IN ('awaiting_token', 'pending')
         AND id <> $3
       LIMIT 1`,
      [match.chain_id, tokenAddress, row.id],
    );
    if (existingOpen.rows[0]) {
      await db.query(
        `UPDATE token_display_finalize_intents
         SET status = 'noop',
             last_error = 'duplicate_intent_for_token',
             updated_at = NOW()
         WHERE id = $1 AND status = 'awaiting_token'`,
        [row.id],
      );
      continue;
    }
    await db.query(
      `UPDATE token_display_finalize_intents
       SET chain_id = $2,
           token_address = $3,
           status = 'pending',
           updated_at = NOW()
       WHERE id = $1 AND status = 'awaiting_token'`,
      [row.id, match.chain_id, tokenAddress],
    );
    bound += 1;
  }
  return { bound, ambiguous };
}

export async function listPendingDisplayFinalizeIntents(
  db: Queryable,
  input: { limit?: number; maxAttempts?: number } = {},
): Promise<TokenDisplayFinalizeIntent[]> {
  const limit = input.limit ?? 20;
  const maxAttempts = input.maxAttempts ?? 5;
  const result = await db.query<IntentRow>(
    `SELECT * FROM token_display_finalize_intents
     WHERE status = 'pending'
       AND attempts < $1
     ORDER BY updated_at ASC
     LIMIT $2`,
    [maxAttempts, limit],
  );
  return result.rows.map(mapRow);
}

export type OrphanTokenDisplayCandidate = {
  chainId: number;
  tokenAddress: string;
  imageUri: string;
  draftId: string | null;
};

/** Recent indexed tokens missing display_image_url (IPFS / draft recovery). */
export async function listOrphanTokenDisplayCandidates(
  db: Queryable,
  input: { lookbackSeconds?: number; limit?: number } = {},
): Promise<OrphanTokenDisplayCandidate[]> {
  const lookbackSeconds = input.lookbackSeconds ?? 172_800;
  const limit = input.limit ?? 20;
  const result = await db.query<{
    chain_id: number;
    token_address: string;
    image_uri: string;
    draft_id: string | null;
  }>(
    `SELECT t.chain_id,
            t.token_address,
            t.image_uri,
            nam.draft_id
     FROM tokens t
     INNER JOIN launches l
       ON l.chain_id = t.chain_id AND l.token_address = t.token_address
     LEFT JOIN news_article_markets nam
       ON nam.chain_id = t.chain_id AND nam.token_address = t.token_address
     WHERE (t.display_image_url IS NULL OR TRIM(t.display_image_url) = '')
       AND t.image_uri IS NOT NULL
       AND TRIM(t.image_uri) <> ''
       AND l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $1)
     ORDER BY l.launched_at DESC
     LIMIT $2`,
    [lookbackSeconds, limit],
  );
  return result.rows.map((row) => ({
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    imageUri: row.image_uri,
    draftId: row.draft_id,
  }));
}

export async function markDisplayFinalizeIntentResult(
  db: Queryable,
  input: {
    id: string;
    status: 'done' | 'failed' | 'noop';
    error?: string | null;
  },
): Promise<void> {
  await db.query(
    `UPDATE token_display_finalize_intents
     SET status = $2,
         attempts = attempts + 1,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [input.id, input.status, input.error?.slice(0, 500) ?? null],
  );
}

export async function bumpDisplayFinalizeIntentAttempt(
  db: Queryable,
  input: { id: string; error?: string | null },
): Promise<void> {
  await db.query(
    `UPDATE token_display_finalize_intents
     SET attempts = attempts + 1,
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.id, input.error?.slice(0, 500) ?? null],
  );
}

/** Expire stale awaiting intents that never matched a token. */
export async function expireStaleAwaitingDisplayFinalizeIntents(
  db: Queryable,
  input: { olderThanSeconds?: number } = {},
): Promise<number> {
  const olderThanSeconds = input.olderThanSeconds ?? 604_800;
  const result = await db.query(
    `UPDATE token_display_finalize_intents
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'awaiting_token'
       AND created_at < NOW() - ($1::text || ' seconds')::interval`,
    [String(olderThanSeconds)],
  );
  return result.rowCount ?? 0;
}

/** Load selected artwork display path for a draft (pin-time enrichment). */
export async function getDraftSelectedDisplayImagePath(
  db: Queryable,
  draftId: string,
): Promise<string | null> {
  const result = await db.query<{ display_image_path: string | null }>(
    `SELECT a.display_image_path
     FROM launch_drafts d
     INNER JOIN launch_draft_artworks a
       ON a.id = d.selected_artwork_asset_id
     WHERE d.id = $1
     LIMIT 1`,
    [draftId],
  );
  const path = String(result.rows[0]?.display_image_path ?? '').trim();
  return path.length > 0 ? path : null;
}
