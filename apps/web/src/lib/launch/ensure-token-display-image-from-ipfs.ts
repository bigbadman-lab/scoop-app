/**
 * Ensure any chain/token has a SCOOP-managed HTTPS display image.
 * Mirrors ipfs:// via the existing token-image bucket; does not change onchain metadata.
 */
import {
  applyDisplayImagePathToToken,
  type Queryable,
} from '@scoop/db';
import {
  createSupabaseTokenImageStorage,
  mirrorIpfsUriToTokenImage,
} from '@scoop/news';

export type EnsureDisplayImageFromIpfsResult =
  | {
      ok: true;
      displayImageUrl: string;
      status: 'applied' | 'skipped' | 'already_present';
    }
  | { ok: false; reason: string };

export async function ensureTokenDisplayImageFromIpfs(input: {
  db: Queryable;
  chainId: number;
  tokenAddress: string;
  imageUri: string | null | undefined;
  /** Existing display URL from DB — skip mirror when already set. */
  existingDisplayImageUrl?: string | null;
}): Promise<EnsureDisplayImageFromIpfsResult> {
  const existing = (input.existingDisplayImageUrl ?? '').trim();
  if (existing && /^https:\/\//i.test(existing)) {
    return {
      ok: true,
      displayImageUrl: existing,
      status: 'already_present',
    };
  }

  const imageUri = (input.imageUri ?? '').trim();
  if (!imageUri) {
    return { ok: false, reason: 'missing_image_uri' };
  }

  // Prefer an already-managed HTTPS URL stored as image_uri (rare).
  if (/^https:\/\//i.test(imageUri) && imageUri.includes('/token-image/')) {
    const write = await applyDisplayImagePathToToken(input.db, {
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      displayImageUrl: imageUri,
    });
    if (write === 'missing_token') {
      return { ok: false, reason: 'missing_token' };
    }
    return {
      ok: true,
      displayImageUrl: imageUri,
      status: write,
    };
  }

  if (!/^ipfs:\/\//i.test(imageUri)) {
    return { ok: false, reason: 'unsupported_image_uri' };
  }

  const storage = createSupabaseTokenImageStorage();
  const gateways = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
  ] as const;
  let mirrored: Awaited<ReturnType<typeof mirrorIpfsUriToTokenImage>> | null =
    null;
  for (const gatewayPrefix of gateways) {
    mirrored = await mirrorIpfsUriToTokenImage({
      imageUri,
      storage,
      gatewayPrefix,
    });
    if (mirrored.ok) break;
  }
  if (!mirrored || !mirrored.ok) {
    return {
      ok: false,
      reason: !mirrored || mirrored.ok ? 'mirror_failed' : mirrored.reason,
    };
  }

  const write = await applyDisplayImagePathToToken(input.db, {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    displayImageUrl: mirrored.publicUrl,
  });
  if (write === 'missing_token') {
    return { ok: false, reason: 'missing_token' };
  }
  return {
    ok: true,
    displayImageUrl: mirrored.publicUrl,
    status: write,
  };
}
