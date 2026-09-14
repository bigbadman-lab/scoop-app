import {
  applyDisplayImagePathToToken,
  applyDraftDisplayImageToToken,
  getTokenImageFields,
  type Queryable,
} from '@scoop/db';
import {
  createSupabaseTokenImageStorage,
  deriveTokenImagePublicUrl,
  isAllowedTokenDisplayImagePath,
  mirrorIpfsUriToTokenImage,
  type TokenImageStorage,
} from '@scoop/news';

export type FinalizeDisplaySource =
  | 'existing'
  | 'path'
  | 'draft'
  | 'ipfs_fallback'
  | 'noop';

export type FinalizeTokenDisplayImageResult =
  | {
      ok: true;
      status: 'applied' | 'skipped' | 'noop';
      source: FinalizeDisplaySource;
      uploaded: boolean;
      retries: number;
      displayPath?: string;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      retries: number;
      source?: FinalizeDisplaySource;
    };

export type FinalizeDisplayOwner =
  | 'client_fast_path'
  | 'server_reconciliation'
  | 'pin_enqueue';

export type FinalizeTokenDisplayImageInput = {
  db: Queryable;
  chainId: number;
  tokenAddress: string;
  /** Manual / pre-created token-image object path (wins over draft). */
  displayImagePath?: string | null;
  /** Launch Assist draft id — used when path absent. */
  draftId?: string | null;
  /** Canonical on-chain/IPFS image URI for fallback mirror. */
  imageUri?: string | null;
  /**
   * When true, poll until the token row exists (bounded).
   * Default true for durable post-receipt finalization.
   */
  waitForIndex?: boolean;
  waitIntervalMs?: number;
  waitTimeoutMs?: number;
  /** Who triggered finalization — for production diagnosis. */
  owner?: FinalizeDisplayOwner;
  tokenImageStorage?: TokenImageStorage;
  supabaseOrigin?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (fields: Record<string, unknown>) => void;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Durable, idempotent server-side finalizer for tokens.display_image_url.
 *
 * Priority:
 * 1. Already-set display_image_url
 * 2. Allowlisted displayImagePath (manual / draft object already in bucket)
 * 3. Selected draft artwork display_image_url
 * 4. Mirror imageUri (ipfs://) → token-image/canonical/{cid}/…
 *
 * Browser post-launch POST is optional fast-path only; server reconciliation
 * owns correctness via pin-time intents + cron/orphan scan.
 */
export async function finalizeTokenDisplayImage(
  input: FinalizeTokenDisplayImageInput,
): Promise<FinalizeTokenDisplayImageResult> {
  const owner = input.owner ?? 'client_fast_path';
  const baseLog =
    input.log ??
    ((fields) => {
      console.info('[token-display-finalize]', JSON.stringify(fields));
    });
  const log = (fields: Record<string, unknown>) =>
    baseLog({ owner, chainId: input.chainId, ...fields });
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;
  const waitForIndex = input.waitForIndex !== false;
  const intervalMs = input.waitIntervalMs ?? 2_500;
  const timeoutMs = input.waitTimeoutMs ?? 60_000;

  const path = input.displayImagePath?.trim().replace(/^\/+/, '') || '';
  const draftId = input.draftId?.trim() || '';
  let imageUri = input.imageUri?.trim() || '';

  let retries = 0;
  let fields = await getTokenImageFields(input.db, {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
  });

  if (!fields && waitForIndex) {
    const deadline = now() + timeoutMs;
    while (!fields && now() < deadline) {
      retries += 1;
      await sleep(intervalMs);
      fields = await getTokenImageFields(input.db, {
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
      });
    }
  }

  if (!fields) {
    log({
      event: 'missing_token',
      tokenAddress: input.tokenAddress,
      retries,
      retryable: true,
    });
    return {
      ok: false,
      error: 'launch_not_indexed',
      retryable: true,
      retries,
    };
  }

  if (fields.displayImageUrl && /^https:\/\//i.test(fields.displayImageUrl)) {
    log({
      event: 'already_set',
      tokenAddress: input.tokenAddress,
      source: 'existing',
      uploaded: false,
      dbUpdated: false,
      retries,
    });
    return {
      ok: true,
      status: 'skipped',
      source: 'existing',
      uploaded: false,
      retries,
    };
  }

  if (!imageUri && fields.imageUri) {
    imageUri = fields.imageUri;
  }

  // --- Path (manual / existing object) ---
  if (path) {
    if (!isAllowedTokenDisplayImagePath(path)) {
      return {
        ok: false,
        error: 'invalid_display_path',
        retryable: false,
        retries,
        source: 'path',
      };
    }
    const origin =
      (input.supabaseOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
        .trim()
        .replace(/\/$/, '');
    if (!origin) {
      return {
        ok: false,
        error: 'display_storage_not_configured',
        retryable: true,
        retries,
        source: 'path',
      };
    }
    const publicUrl = deriveTokenImagePublicUrl(origin, path);
    try {
      const result = await applyDisplayImagePathToToken(input.db, {
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        displayImageUrl: publicUrl,
      });
      if (result === 'missing_token') {
        return {
          ok: false,
          error: 'launch_not_indexed',
          retryable: true,
          retries,
          source: 'path',
        };
      }
      log({
        event: 'applied_path',
        tokenAddress: input.tokenAddress,
        source: 'path',
        route: path.startsWith('manual/') ? 'manual' : 'ai',
        displayPath: path,
        uploaded: false,
        dbUpdated: result === 'applied',
        retries,
      });
      return {
        ok: true,
        status: result,
        source: 'path',
        uploaded: false,
        retries,
        displayPath: path,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'db_write_failed';
      return {
        ok: false,
        error: message,
        retryable: true,
        retries,
        source: 'path',
      };
    }
  }

  // --- Draft artwork display copy ---
  if (draftId) {
    try {
      const applied = await applyDraftDisplayImageToToken(input.db, {
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        draftId,
      });
      if (applied) {
        log({
          event: 'applied_draft',
          tokenAddress: input.tokenAddress,
          source: 'draft',
          route: 'ai',
          uploaded: false,
          dbUpdated: true,
          retries,
        });
        return {
          ok: true,
          status: 'applied',
          source: 'draft',
          uploaded: false,
          retries,
        };
      }
      // Missing draft display copy — fall through to IPFS.
      log({
        event: 'draft_display_missing',
        tokenAddress: input.tokenAddress,
        source: 'draft',
        route: 'ai',
        retries,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'draft_apply_failed';
      return {
        ok: false,
        error: message,
        retryable: true,
        retries,
        source: 'draft',
      };
    }
  }

  // --- IPFS fallback mirror ---
  if (!imageUri) {
    log({
      event: 'noop_no_source',
      tokenAddress: input.tokenAddress,
      source: 'noop',
      retries,
    });
    return {
      ok: true,
      status: 'noop',
      source: 'noop',
      uploaded: false,
      retries,
    };
  }

  let storage: TokenImageStorage;
  try {
    storage = input.tokenImageStorage ?? createSupabaseTokenImageStorage();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'storage_config';
    return {
      ok: false,
      error: message,
      retryable: true,
      retries,
      source: 'ipfs_fallback',
    };
  }

  const mirrored = await mirrorIpfsUriToTokenImage({
    imageUri,
    storage,
    fetchImpl: input.fetchImpl,
  });
  if (!mirrored.ok) {
    log({
      event: 'ipfs_mirror_failed',
      tokenAddress: input.tokenAddress,
      source: 'ipfs_fallback',
      error: mirrored.reason,
      retryable: mirrored.retryable,
      retries,
    });
    return {
      ok: false,
      error: mirrored.reason,
      retryable: mirrored.retryable,
      retries,
      source: 'ipfs_fallback',
    };
  }

  try {
    const result = await applyDisplayImagePathToToken(input.db, {
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      displayImageUrl: mirrored.publicUrl,
    });
    if (result === 'missing_token') {
      return {
        ok: false,
        error: 'launch_not_indexed',
        retryable: true,
        retries,
        source: 'ipfs_fallback',
      };
    }
    log({
      event: 'applied_ipfs_fallback',
      tokenAddress: input.tokenAddress,
      source: 'ipfs_fallback',
      route: 'ipfs_fallback',
      displayPath: mirrored.path,
      uploaded: mirrored.uploaded,
      dbUpdated: result === 'applied',
      retries,
    });
    return {
      ok: true,
      status: result,
      source: 'ipfs_fallback',
      uploaded: mirrored.uploaded,
      retries,
      displayPath: mirrored.path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'db_write_failed';
    return {
      ok: false,
      error: message,
      retryable: true,
      retries,
      source: 'ipfs_fallback',
    };
  }
}
