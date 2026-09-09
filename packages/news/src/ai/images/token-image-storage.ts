import { createHash } from 'node:crypto';
import { sanitizePathSegment } from './client.js';

export const TOKEN_IMAGE_BUCKET = 'token-image';
export const TOKEN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const TOKEN_IMAGE_MIME = new Set<string>([
  'image/png',
  'image/webp',
  'image/jpeg',
]);

export type TokenImageStorage = {
  uploadDisplayCopy: (input: {
    path: string;
    bytes: Buffer;
    mimeType: string;
  }) => Promise<{ path: string; publicUrl: string }>;
  publicUrlForPath: (path: string) => string;
};

export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
    default:
      return 'png';
  }
}

/** Content-addressed draft path: drafts/{draftId}/{artworkId}/{hash16}.{ext} */
export function buildTokenDisplayImagePath(input: {
  draftId: string;
  artworkId: string;
  bytes: Buffer;
  mimeType: string;
}): string {
  const draftId = sanitizePathSegment(input.draftId);
  const artworkId = sanitizePathSegment(input.artworkId);
  const hash = createHash('sha256').update(input.bytes).digest('hex').slice(0, 16);
  const ext = extensionForMime(input.mimeType);
  return `drafts/${draftId}/${artworkId}/${hash}.${ext}`;
}

/**
 * Manual upload path: manual/{hash16}/{hash16}.{ext}
 * Same bytes → same path (upsert-idempotent).
 */
export function buildManualTokenDisplayImagePath(input: {
  bytes: Buffer;
  mimeType: string;
}): string {
  const hash = createHash('sha256').update(input.bytes).digest('hex').slice(0, 16);
  const ext = extensionForMime(input.mimeType);
  return `manual/${hash}/${hash}.${ext}`;
}

const ALLOWED_DISPLAY_PATH =
  /^(drafts\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-f0-9]{16}\.(png|jpg|webp)|manual\/[a-f0-9]{16}\/[a-f0-9]{16}\.(png|jpg|webp))$/;

/** Server-side allowlist for client-supplied display object paths (never raw URLs). */
export function isAllowedTokenDisplayImagePath(path: string): boolean {
  const trimmed = path.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return false;
  return ALLOWED_DISPLAY_PATH.test(trimmed);
}

export function validateTokenDisplayImage(input: {
  bytes: Buffer;
  mimeType: string;
}): void {
  if (!TOKEN_IMAGE_MIME.has(input.mimeType)) {
    throw new Error('UNSUPPORTED_MIME');
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > TOKEN_IMAGE_MAX_BYTES) {
    throw new Error('INVALID_SIZE');
  }
}

/**
 * Derive public HTTPS URL from known Supabase origin + bucket + object path.
 * Never trust a caller-supplied arbitrary URL.
 */
export function deriveTokenImagePublicUrl(
  supabaseOrigin: string,
  objectPath: string,
): string {
  const origin = supabaseOrigin.trim().replace(/\/$/, '');
  const path = objectPath.replace(/^\/+/, '');
  if (!origin || !path || path.includes('..') || path.includes('\\')) {
    throw new Error('Invalid token-image public URL inputs');
  }
  return `${origin}/storage/v1/object/public/${TOKEN_IMAGE_BUCKET}/${path}`;
}

/**
 * Service-role Storage client via Supabase REST (mirrors profile-avatar pattern).
 * Anonymous browser uploads are not used.
 */
export function createSupabaseTokenImageStorage(
  env: NodeJS.ProcessEnv = process.env,
): TokenImageStorage {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for token-image storage',
    );
  }

  return {
    publicUrlForPath(path) {
      return deriveTokenImagePublicUrl(url, path);
    },

    async uploadDisplayCopy({ path, bytes, mimeType }) {
      validateTokenDisplayImage({ bytes, mimeType });
      const endpoint = `${url}/storage/v1/object/${TOKEN_IMAGE_BUCKET}/${path}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `token-image upload failed: ${res.status}${detail ? ` ${detail.slice(0, 120)}` : ''}`,
        );
      }
      return { path, publicUrl: deriveTokenImagePublicUrl(url, path) };
    },
  };
}
