/**
 * Safe wallet artwork for SCOOP headless chooser.
 * Never constructs Reown getAssetImage/undefined URLs.
 */

export type ScoopWalletImageInput = {
  name?: string | null;
  imageUrl?: string | null;
  imageId?: string | null;
};

/** True when a URL is usable as an <img src> and is not an undefined-asset sentinel. */
export function isSafeScoopWalletImageUrl(url: string | null | undefined): boolean {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return false;
  if (/\/getAssetImage\/undefined\b/i.test(trimmed)) return false;
  if (/\/getWalletImage\/undefined\b/i.test(trimmed)) return false;
  if (trimmed === 'undefined' || trimmed.endsWith('/undefined')) return false;
  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:')
  );
}

/**
 * Resolve a displayable wallet image, or null → caller should use monogram fallback.
 * Prefer supplied imageUrl; never synthesize Reown asset URLs from missing IDs.
 */
export function resolveScoopWalletImageSrc(
  wallet: ScoopWalletImageInput,
): string | null {
  if (isSafeScoopWalletImageUrl(wallet.imageUrl)) {
    return (wallet.imageUrl ?? '').trim();
  }
  // Missing / invalid imageId must not trigger a network asset lookup.
  return null;
}

export function scoopWalletMonogram(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const letters = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  return trimmed.slice(0, 1).toUpperCase();
}
