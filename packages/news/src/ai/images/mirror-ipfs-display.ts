import {
  buildCanonicalTokenDisplayImagePath,
  parseIpfsCid,
  TOKEN_IMAGE_MAX_BYTES,
  TOKEN_IMAGE_MIME,
  validateTokenDisplayImage,
  type TokenImageStorage,
} from './token-image-storage.js';

export const SCOOP_IPFS_GATEWAY_PREFIX = 'https://ipfs.io/ipfs';

export type MirrorIpfsDisplayResult =
  | {
      ok: true;
      path: string;
      publicUrl: string;
      uploaded: boolean;
      mimeType: string;
      cid: string;
    }
  | { ok: false; reason: string; retryable: boolean };

function normalizeMime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'image/jpg') return 'image/jpeg';
  return TOKEN_IMAGE_MIME.has(base) ? base : null;
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Fetch canonical `ipfs://` bytes via trusted gateway and upsert into `token-image`.
 * Idempotent: content-addressed `canonical/{cid}/{cid}.{ext}` + upsert.
 */
export async function mirrorIpfsUriToTokenImage(input: {
  imageUri: string;
  storage: TokenImageStorage;
  fetchImpl?: typeof fetch;
  gatewayPrefix?: string;
}): Promise<MirrorIpfsDisplayResult> {
  const cid = parseIpfsCid(input.imageUri);
  if (!cid) {
    return { ok: false, reason: 'not_ipfs_uri', retryable: false };
  }

  const gateway = (input.gatewayPrefix ?? SCOOP_IPFS_GATEWAY_PREFIX).replace(/\/$/, '');
  const url = `${gateway}/${cid}`;
  const fetchFn = input.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch_failed';
    return { ok: false, reason: `ipfs_fetch:${message}`, retryable: true };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: `ipfs_http_${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  }

  const headerMime = normalizeMime(res.headers.get('content-type'));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > TOKEN_IMAGE_MAX_BYTES) {
    return { ok: false, reason: 'invalid_size', retryable: false };
  }

  const mimeType = headerMime ?? sniffMime(buf);
  if (!mimeType) {
    return { ok: false, reason: 'non_image_content', retryable: false };
  }

  try {
    validateTokenDisplayImage({ bytes: buf, mimeType });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid_image';
    return { ok: false, reason, retryable: false };
  }

  const path = buildCanonicalTokenDisplayImagePath({ cid, mimeType });
  const publicUrl = input.storage.publicUrlForPath(path);

  // Reuse existing public object when present (avoid duplicate upload work).
  try {
    const head = await fetchFn(publicUrl, { method: 'HEAD' });
    if (head.ok) {
      return {
        ok: true,
        path,
        publicUrl,
        uploaded: false,
        mimeType,
        cid,
      };
    }
  } catch {
    // Fall through to upload.
  }

  try {
    const uploaded = await input.storage.uploadDisplayCopy({
      path,
      bytes: buf,
      mimeType,
    });
    return {
      ok: true,
      path: uploaded.path,
      publicUrl: uploaded.publicUrl,
      uploaded: true,
      mimeType,
      cid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upload_failed';
    return { ok: false, reason: message, retryable: true };
  }
}
