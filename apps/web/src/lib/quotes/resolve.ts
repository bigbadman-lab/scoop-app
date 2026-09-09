import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

/** Map a token quoteAsset address to catalogue display symbol. */
export function quoteDisplaySymbol(
  quoteAsset: string,
  catalogue: readonly PublicQuoteCatalogueItem[],
): string {
  const key = quoteAsset.trim().toLowerCase();
  const hit = catalogue.find((q) => q.quoteAsset.toLowerCase() === key);
  if (hit?.displaySymbol) return hit.displaySymbol;
  if (hit?.symbol) return hit.symbol;
  return truncateShort(quoteAsset);
}

/** Catalogue image for quote badge — null when missing (monogram fallback). */
export function quoteCatalogueImageUrl(
  quoteAsset: string,
  catalogue: readonly PublicQuoteCatalogueItem[],
): string | null {
  const key = quoteAsset.trim().toLowerCase();
  const hit = catalogue.find((q) => q.quoteAsset.toLowerCase() === key);
  const url = hit?.imageUrl?.trim();
  return url || null;
}

function truncateShort(address: string): string {
  const v = address.trim();
  if (v.length < 10) return v.toUpperCase();
  return `${v.slice(0, 4)}…${v.slice(-2)}`.toUpperCase();
}

export function buildQuoteLookup(
  catalogue: readonly PublicQuoteCatalogueItem[],
): Map<string, PublicQuoteCatalogueItem> {
  return new Map(catalogue.map((q) => [q.quoteAsset.toLowerCase(), q]));
}
