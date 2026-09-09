/**
 * Client-side pin-once helper for launch artwork.
 * Reuses existing ipfsUri; otherwise fetches selected preview bytes and pins via SCOOP API.
 */
import { isProtocolIpfsImageUri } from '@/lib/launch/protocol-metadata';
import { META_LIMITS, type TokenImageState } from '@/lib/launch/types';

export type EnsurePinnedResult = {
  ipfsUri: string;
  reused: boolean;
  cid?: string;
};

export type EnsurePinnedError = {
  ok: false;
  error: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
  const existing = args.image.ipfsUri?.trim() ?? '';
  if (existing && isProtocolIpfsImageUri(existing)) {
    return { ipfsUri: existing, reused: true };
  }

  if (!args.image.previewUrl) {
    throw new Error('Token image is required before launch.');
  }

  const fetchFn = args.fetchImpl ?? fetch;
  const artRes = await fetchFn(args.image.previewUrl, {
    signal: args.signal,
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
    args.image.mimeType?.trim() ||
    artRes.headers.get('content-type')?.split(';')[0]?.trim() ||
    'image/png';

  const pinRes = await fetchFn('/api/launch/artwork/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: args.signal,
    body: JSON.stringify({
      bytesBase64: bytesToBase64(buffer),
      mimeType,
      fileName: args.image.fileName,
    }),
  });

  const body = (await pinRes.json().catch(() => null)) as
    | { ok?: boolean; ipfsUri?: string; cid?: string; error?: string }
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
  };
}
