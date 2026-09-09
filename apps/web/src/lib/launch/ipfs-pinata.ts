/**
 * Pinata implementation of LaunchArtworkIpfsPinner.
 * Server-only — uses PINATA_JWT (never NEXT_PUBLIC_*).
 */
import {
  createUnconfiguredIpfsPinner,
  type IpfsPinRequest,
  type IpfsPinResult,
  type LaunchArtworkIpfsPinner,
  IpfsPinNotConfiguredError,
  assertIpfsUriForLaunch,
} from '@/lib/launch/ipfs';
import { PROTOCOL_META } from '@/lib/launch/protocol-metadata';
import { META_LIMITS } from '@/lib/launch/types';

const PINATA_PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

export type PinataEnv = {
  PINATA_JWT?: string | undefined;
  [key: string]: string | undefined;
};

export function isPinataConfigured(env: PinataEnv = process.env as PinataEnv): boolean {
  return Boolean((env.PINATA_JWT ?? '').trim());
}

export function createPinataArtworkPinner(
  env: PinataEnv = process.env as PinataEnv,
  fetchImpl: typeof fetch = fetch,
): LaunchArtworkIpfsPinner {
  const jwt = (env.PINATA_JWT ?? '').trim();
  if (!jwt) {
    throw new IpfsPinNotConfiguredError();
  }

  return {
    async pinArtwork(request: IpfsPinRequest): Promise<IpfsPinResult> {
      if (request.bytes.byteLength === 0) {
        throw new Error('Artwork bytes are empty.');
      }
      if (request.bytes.byteLength > META_LIMITS.imageFileMaxBytes) {
        throw new Error('Artwork exceeds maximum size for launch.');
      }
      const mime = request.mimeType.trim() || 'application/octet-stream';
      if (!(META_LIMITS.imageMime as readonly string[]).includes(mime)) {
        throw new Error('Artwork must be PNG, JPEG, or WebP.');
      }

      const form = new FormData();
      // Uint8Array → Blob (BufferSource)
      const copy = new Uint8Array(request.bytes);
      const blob = new Blob([copy], { type: mime });
      const fileName = request.fileName?.trim() || 'token-artwork';
      form.append('file', blob, fileName);
      form.append(
        'pinataMetadata',
        JSON.stringify({ name: fileName.slice(0, 64) }),
      );
      form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const res = await fetchImpl(PINATA_PIN_FILE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `IPFS pin failed (${res.status}). ${summarizePinataError(text)}`,
        );
      }

      const body = (await res.json()) as { IpfsHash?: unknown; Hash?: unknown };
      const cidRaw =
        typeof body.IpfsHash === 'string'
          ? body.IpfsHash
          : typeof body.Hash === 'string'
            ? body.Hash
            : '';
      const cid = cidRaw.trim();
      if (!cid || !/^[a-zA-Z0-9]+$/.test(cid)) {
        throw new Error('IPFS pin returned an invalid CID.');
      }

      const ipfsUri = `${PROTOCOL_META.imageUriPrefix}${cid}`;
      assertIpfsUriForLaunch(ipfsUri);
      return { ipfsUri, cid };
    },
  };
}

/** Prefer Pinata when configured; otherwise unconfigured stub. */
export function createLaunchArtworkPinner(
  env: PinataEnv = process.env as PinataEnv,
): LaunchArtworkIpfsPinner {
  if (isPinataConfigured(env)) {
    return createPinataArtworkPinner(env);
  }
  return createUnconfiguredIpfsPinner();
}

function summarizePinataError(body: string): string {
  const trimmed = body.trim().slice(0, 120);
  if (!trimmed) return 'Try again in a moment.';
  if (/unauthorized|forbidden|jwt|token|auth/i.test(trimmed)) {
    return 'Pinning service rejected the request.';
  }
  return 'Try again in a moment.';
}
