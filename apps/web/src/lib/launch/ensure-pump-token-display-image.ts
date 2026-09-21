/**
 * Ensure a Pump/Solana token has a SCOOP-managed HTTPS display image.
 * Thin wrapper over the shared IPFS→token-image mirror used by RHC/PONS too.
 */
import type { Queryable } from '@scoop/db';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import { ensureTokenDisplayImageFromIpfs } from '@/lib/launch/ensure-token-display-image-from-ipfs';

export type EnsurePumpDisplayImageResult =
  | {
      ok: true;
      displayImageUrl: string;
      status: 'applied' | 'skipped' | 'already_present';
    }
  | { ok: false; reason: string };

export async function ensurePumpTokenDisplayImage(input: {
  db: Queryable;
  mint: string;
  imageUri: string | null | undefined;
  /** Existing display URL from DB — skip mirror when already set. */
  existingDisplayImageUrl?: string | null;
}): Promise<EnsurePumpDisplayImageResult> {
  return ensureTokenDisplayImageFromIpfs({
    db: input.db,
    chainId: SOLANA_MAINNET_CHAIN_ID,
    tokenAddress: input.mint,
    imageUri: input.imageUri,
    existingDisplayImageUrl: input.existingDisplayImageUrl,
  });
}
