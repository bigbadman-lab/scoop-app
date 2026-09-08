/**
 * Deterministic fallback avatar when no custom avatar_path exists.
 * Base64 data URLs render reliably in <img> across browsers.
 */
export function fallbackAvatarDataUrl(userId: string, displayName?: string | null): string {
  const seed = userId.trim().toLowerCase() || 'scoop';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const initials = (displayName?.trim() || 'SC')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'SC';

  // Full-bleed square fill — UI chrome clips shape (sidebar rounded-md / mobile circle).
  // Do not use rx=half-size: that leaves transparent corners over white parent backgrounds.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="hsl(${hue},42%,42%)"/><text x="48" y="54" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="32" font-weight="600" fill="#ffffff">${initials}</text></svg>`;

  if (typeof Buffer !== 'undefined') {
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  }
  // Browser / edge without Buffer
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * Bust browser/CDN cache when the storage object path is reused across uploads.
 * No-op for data-URL fallbacks.
 */
export function bustAvatarCacheUrl(
  url: string,
  version: string | number = Date.now(),
): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  const v = encodeURIComponent(String(version));
  // Replace prior bust param if present.
  const withoutV = trimmed
    .replace(/([?&])v=[^&]*&?/, '$1')
    .replace(/[?&]$/, '');
  return withoutV.includes('?') ? `${withoutV}&v=${v}` : `${withoutV}?v=${v}`;
}

export function resolveAvatarUrl(input: {
  userId: string;
  displayName?: string | null;
  signedAvatarUrl?: string | null;
  /** Optional cache-bust token (e.g. upload timestamp). */
  cacheVersion?: string | number | null;
}): string {
  if (input.signedAvatarUrl?.trim()) {
    const signed = input.signedAvatarUrl.trim();
    return input.cacheVersion != null
      ? bustAvatarCacheUrl(signed, input.cacheVersion)
      : signed;
  }
  return fallbackAvatarDataUrl(input.userId, input.displayName);
}
