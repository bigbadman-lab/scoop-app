/**
 * Canonical SCOOP token-image URI resolver.
 * Converts indexed `ipfs://` metadata into a single public HTTPS gateway URL.
 * Prefer SCOOP `displayImageUrl` when present; IPFS remains the fallback.
 * Do not pass raw `ipfs://` to <img> / next/image.
 */

/** Protocol Labs public gateway — one canonical host for product token art. */
export const SCOOP_IPFS_GATEWAY_ORIGIN = 'https://ipfs.io';
export const SCOOP_IPFS_GATEWAY_PREFIX = `${SCOOP_IPFS_GATEWAY_ORIGIN}/ipfs`;

const UNSAFE_SCHEMES = /^(javascript|data|file|blob):/i;

/**
 * Prefer SCOOP display HTTPS, else resolve canonical imageUri (IPFS/HTTP).
 */
export function pickTokenImageSrc(
  displayImageUrl: string | null | undefined,
  imageUri: string | null | undefined,
): string | null {
  const display = resolveTokenImageSrc(displayImageUrl);
  if (display) return display;
  return resolveTokenImageSrc(imageUri);
}

/**
 * Normalize token `imageUri` for browser rendering.
 * Returns null when missing/unsafe so callers can show ImageFallback.
 */
export function resolveTokenImageSrc(uri: string | null | undefined): string | null {
  if (uri == null) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (UNSAFE_SCHEMES.test(trimmed)) return null;

  if (/^ipfs:\/\//i.test(trimmed)) {
    let path = trimmed.replace(/^ipfs:\/\//i, '');
    // Tolerate ipfs://ipfs/<cid> double-prefix from some tooling.
    if (path.toLowerCase().startsWith('ipfs/')) {
      path = path.slice(5);
    }
    path = path.replace(/^\/+/, '');
    if (!path || path.includes('..') || path.includes('\\')) return null;
    // Basic CID/path sanity: must start with alnum (CIDv0/v1)
    if (!/^[a-zA-Z0-9]/.test(path)) return null;
    return `${SCOOP_IPFS_GATEWAY_PREFIX}/${path}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  return null;
}
