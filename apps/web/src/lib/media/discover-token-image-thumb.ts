/**
 * Homepage Discover-only: rewrite public Supabase token-image object URLs
 * to Storage image-transform render URLs (square thumbnails).
 *
 * Does not mutate stored objects or affect non-Discover surfaces.
 * False negatives (passthrough) are preferred over transforming unrelated URLs.
 */

export const DISCOVER_TOKEN_IMAGE_THUMB = {
  width: 640,
  height: 640,
  quality: 70,
} as const;

const OBJECT_PATH_PREFIX = '/storage/v1/object/public/token-image/';
const RENDER_PATH_PREFIX = '/storage/v1/render/image/public/token-image/';

/**
 * Map a resolved Discover card image URL to a Supabase transform thumb when safe.
 * Returns the input unchanged (or null) when the URL is not a public token-image object URL.
 */
export function toDiscoverTokenImageThumb(
  src: string | null | undefined,
): string | null {
  if (src == null) return null;
  const trimmed = src.trim();
  if (!trimmed) return src;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return src;
  }

  if (url.protocol !== 'https:') return src;

  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.supabase.co')) return src;

  // Already a render URL — leave alone (do not re-param).
  if (url.pathname.startsWith('/storage/v1/render/image/')) return src;

  if (!url.pathname.startsWith(OBJECT_PATH_PREFIX)) return src;

  const objectPath = url.pathname.slice(OBJECT_PATH_PREFIX.length);
  if (!objectPath || objectPath.includes('..') || objectPath.includes('\\')) {
    return src;
  }

  url.pathname = `${RENDER_PATH_PREFIX}${objectPath}`;
  url.search = '';
  url.searchParams.set('width', String(DISCOVER_TOKEN_IMAGE_THUMB.width));
  url.searchParams.set('height', String(DISCOVER_TOKEN_IMAGE_THUMB.height));
  url.searchParams.set('quality', String(DISCOVER_TOKEN_IMAGE_THUMB.quality));
  return url.toString();
}
