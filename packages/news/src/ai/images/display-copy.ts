import type { Queryable } from '@scoop/db';
import type { DraftAssetStorage } from './storage.js';
import {
  buildTokenDisplayImagePath,
  createSupabaseTokenImageStorage,
  type TokenImageStorage,
  validateTokenDisplayImage,
} from './token-image-storage.js';

export type PersistDisplayCopyResult =
  | { ok: true; path: string; publicUrl: string }
  | { ok: false; reason: string };

/**
 * Copy selected draft artwork into public `token-image` and persist URL on the artwork row.
 * Failure is non-fatal for launch: callers should keep going with canonical IPFS later.
 */
export async function persistSelectedArtworkDisplayCopy(input: {
  db: Queryable;
  draftId: string;
  artworkId: string;
  draftStoragePath: string;
  mimeType: string;
  draftStorage: DraftAssetStorage;
  tokenImageStorage?: TokenImageStorage;
  log?: (message: string, err?: unknown) => void;
}): Promise<PersistDisplayCopyResult> {
  const log = input.log ?? ((msg, err) => console.warn(`[token-image] ${msg}`, err ?? ''));

  try {
    const bytes = await input.draftStorage.downloadArtwork(input.draftStoragePath);
    validateTokenDisplayImage({ bytes, mimeType: input.mimeType });

    const path = buildTokenDisplayImagePath({
      draftId: input.draftId,
      artworkId: input.artworkId,
      bytes,
      mimeType: input.mimeType,
    });

    const storage =
      input.tokenImageStorage ?? createSupabaseTokenImageStorage();
    const uploaded = await storage.uploadDisplayCopy({
      path,
      bytes,
      mimeType: input.mimeType,
    });

    await input.db.query(
      `UPDATE launch_draft_artworks
       SET display_image_path = $2,
           display_image_url = $3
       WHERE id = $1 AND draft_id = $4`,
      [input.artworkId, uploaded.path, uploaded.publicUrl, input.draftId],
    );

    return { ok: true, path: uploaded.path, publicUrl: uploaded.publicUrl };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    log(`display copy upload failed for artwork ${input.artworkId}: ${reason}`, err);
    return { ok: false, reason };
  }
}
