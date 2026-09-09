/**
 * Client-side pin-once helper for launch artwork.
 * Reuses existing ipfsUri; otherwise fetches selected preview bytes and pins via SCOOP API.
 * Manual uploads also persist a token-image display path (same bytes as IPFS).
 */
import { isProtocolIpfsImageUri } from '@/lib/launch/protocol-metadata';
import { META_LIMITS, type TokenImageState } from '@/lib/launch/types';

export type EnsurePinnedResult = {
  ipfsUri: string;
  reused: boolean;
  cid?: string;
  /** Server object path in token-image bucket (manual uploads). */
  displayImagePath?: string | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readSelectedBytes(
  image: TokenImageState,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<{ buffer: Uint8Array; mimeType: string }> {
  if (!image.previewUrl) {
    throw new Error('Token image is required before launch.');
  }
  const artRes = await fetchFn(image.previewUrl, {
    signal,
    cache: 'no-store',
  });
  if (!artRes.ok) {
    throw new Error('Could not read the selected token image for pinning.');
  }
  const buffer = new Uint8Array(await artRes.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error('Selected token image is empty.');
  }
  if (buffer.byteLength > META_LIMITS.imageFileMaxBytes) {
    throw new Error('Token image is too large to pin.');
  }
  const mimeType =
    image.mimeType?.trim() ||
    artRes.headers.get('content-type')?.split(';')[0]?.trim() ||
    'image/png';
  return { buffer, mimeType };
}

/**
 * Canonical selected artwork for launch = current TokenImageState
 * (manual upload sets source:'user' and wins over late AI via LaunchFlow).
 */
export async function ensureArtworkPinned(args: {
  image: TokenImageState;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<EnsurePinnedResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  const persistDisplayCopy = args.image.source === 'user';
  const existing = args.image.ipfsUri?.trim() ?? '';
  const existingPath = args.image.displayImagePath?.trim() || null;

  if (existing && isProtocolIpfsImageUri(existing)) {
    if (!persistDisplayCopy || existingPath) {
      return {
        ipfsUri: existing,
        reused: true,
        displayImagePath: existingPath,
      };
    }
    // Manual image already pinned but missing display path — upload display only.
    const { buffer, mimeType } = await readSelectedBytes(
      args.image,
      fetchFn,
      args.signal,
    );
    const pinRes = await fetchFn('/api/launch/artwork/pin', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: args.signal,
      body: JSON.stringify({
        bytesBase64: bytesToBase64(buffer),
        mimeType,
        fileName: args.image.fileName,
        persistDisplayCopy: true,
        displayCopyOnly: true,
        existingIpfsUri: existing,
      }),
    });
    const body = (await pinRes.json().catch(() => null)) as {
      ok?: boolean;
      ipfsUri?: string;
      displayImagePath?: string | null;
      error?: string;
    } | null;
    if (!pinRes.ok || !body?.ok) {
      // Non-fatal for launch: keep IPFS; display may fall back to gateway.
      console.warn(
        '[launch] display copy upload failed after pin reuse',
        body?.error ?? pinRes.status,
      );
      return { ipfsUri: existing, reused: true, displayImagePath: null };
    }
    return {
      ipfsUri: body.ipfsUri && isProtocolIpfsImageUri(body.ipfsUri)
        ? body.ipfsUri
        : existing,
      reused: true,
      displayImagePath: body.displayImagePath ?? null,
    };
  }

  const { buffer, mimeType } = await readSelectedBytes(
    args.image,
    fetchFn,
    args.signal,
  );

  const pinRes = await fetchFn('/api/launch/artwork/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: args.signal,
    body: JSON.stringify({
      bytesBase64: bytesToBase64(buffer),
      mimeType,
      fileName: args.image.fileName,
      persistDisplayCopy,
    }),
  });

  const body = (await pinRes.json().catch(() => null)) as
    | {
        ok?: boolean;
        ipfsUri?: string;
        cid?: string;
        displayImagePath?: string | null;
        error?: string;
      }
    | null;

  if (!pinRes.ok || !body?.ipfsUri) {
    throw new Error(body?.error ?? 'Could not pin artwork to IPFS.');
  }
  if (!isProtocolIpfsImageUri(body.ipfsUri)) {
    throw new Error('Pinning service returned an invalid image URI.');
  }

  return {
    ipfsUri: body.ipfsUri,
    reused: false,
    cid: body.cid,
    displayImagePath: body.displayImagePath ?? null,
  };
}
